import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export interface SuspiciousEvent {
  id: string;
  type:
    | 'brute_force'
    | 'after_hours_login'
    | 'mass_download'
    | 'bulk_deletion'
    | 'ip_hopping';
  severity: 'high' | 'medium' | 'low';
  user_id: string;
  user_email: string;
  user_name: string;
  description: string;
  detail: string;
  detected_at: string;
  count: number;
}

// PHT = UTC+8. Work hours: 6:00 AM – 10:00 PM PHT
function isAfterHoursPHT(utcDateStr: string): boolean {
  const d = new Date(utcDateStr);
  const phtHour = (d.getUTCHours() + 8) % 24;
  return phtHour < 6 || phtHour >= 22;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

// Returns true if timestamps contain N or more events within windowMs
function hasCluster(timestamps: string[], n: number, windowMs: number): { found: boolean; count: number; earliest: string } {
  const sorted = [...timestamps].sort();
  let maxCount = 0;
  let earliest = '';
  for (let i = 0; i <= sorted.length - n; i++) {
    const start = new Date(sorted[i]).getTime();
    const end = new Date(sorted[i + n - 1]).getTime();
    if (end - start <= windowMs) {
      const count = sorted.slice(i).filter(t => new Date(t).getTime() - start <= windowMs).length;
      if (count > maxCount) {
        maxCount = count;
        earliest = sorted[i];
      }
    }
  }
  return { found: maxCount >= n, count: maxCount, earliest };
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Auth check — compliance or admin only
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set(name, value, options),
        remove: (name) => cookieStore.delete(name),
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['compliance', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const service = createClient(supabaseUrl, supabaseServiceKey);

    // Window: last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch all three audit tables in parallel
    const [loginRes, fileRes, deletionRes] = await Promise.all([
      service
        .from('login_audit')
        .select('id, user_id, ip_address, device_name, success, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true }),
      service
        .from('file_audit_logs')
        .select('id, user_id, action, file_name, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true }),
      service
        .from('deletion_audit_logs')
        .select('id, user_id, entity_type, entity_name, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true }),
    ]);

    const loginLogs: any[] = loginRes.data ?? [];
    const fileLogs: any[] = fileRes.data ?? [];
    const deletionLogs: any[] = deletionRes.data ?? [];

    // Collect all unique user IDs
    const allUserIds = [
      ...new Set([
        ...loginLogs.map((l) => l.user_id),
        ...fileLogs.map((l) => l.user_id),
        ...deletionLogs.map((l) => l.user_id),
      ]),
    ].filter(Boolean);

    // Resolve user info
    const userMap = new Map<string, { email: string; name: string }>();
    if (allUserIds.length > 0) {
      const { data: users } = await service
        .from('users')
        .select('id, email, name')
        .in('id', allUserIds);
      (users ?? []).forEach((u: any) => userMap.set(u.id, { email: u.email, name: u.name }));
    }

    const events: SuspiciousEvent[] = [];
    let eventCounter = 0;
    const nextId = () => `se-${++eventCounter}`;

    // ─── 1. BRUTE FORCE: 5+ failed logins per user in 60 min ─────────────────
    const failedByUser = groupBy(
      loginLogs.filter((l) => !l.success),
      (l) => l.user_id
    );
    for (const [uid, logs] of Object.entries(failedByUser)) {
      const { found, count, earliest } = hasCluster(
        logs.map((l) => l.created_at),
        5,
        60 * 60 * 1000
      );
      if (found) {
        const u = userMap.get(uid) ?? { email: uid, name: 'Unknown' };
        events.push({
          id: nextId(),
          type: 'brute_force',
          severity: 'high',
          user_id: uid,
          user_email: u.email,
          user_name: u.name,
          description: 'Multiple failed login attempts',
          detail: `${count} failed login attempts within 60 minutes.`,
          detected_at: earliest,
          count,
        });
      }
    }

    // ─── 2. AFTER-HOURS LOGIN: successful login outside 6AM–10PM PHT ─────────
    const successLogins = loginLogs.filter((l) => l.success);
    for (const log of successLogins) {
      if (isAfterHoursPHT(log.created_at)) {
        const u = userMap.get(log.user_id) ?? { email: log.user_id, name: 'Unknown' };
        const phtHour = (new Date(log.created_at).getUTCHours() + 8) % 24;
        const phtLabel = `${String(phtHour).padStart(2, '0')}:${String(new Date(log.created_at).getUTCMinutes()).padStart(2, '0')} PHT`;
        events.push({
          id: nextId(),
          type: 'after_hours_login',
          severity: 'low',
          user_id: log.user_id,
          user_email: u.email,
          user_name: u.name,
          description: 'Login outside business hours',
          detail: `Successful login at ${phtLabel} (outside 6 AM–10 PM PHT). Device: ${log.device_name ?? 'Unknown'}.`,
          detected_at: log.created_at,
          count: 1,
        });
      }
    }

    // ─── 3. MASS DOWNLOAD: 5+ downloads by same user in 60 min ───────────────
    const downloadsByUser = groupBy(
      fileLogs.filter((l) => l.action === 'download'),
      (l) => l.user_id
    );
    for (const [uid, logs] of Object.entries(downloadsByUser)) {
      const { found, count, earliest } = hasCluster(
        logs.map((l) => l.created_at),
        5,
        60 * 60 * 1000
      );
      if (found) {
        const u = userMap.get(uid) ?? { email: uid, name: 'Unknown' };
        events.push({
          id: nextId(),
          type: 'mass_download',
          severity: 'medium',
          user_id: uid,
          user_email: u.email,
          user_name: u.name,
          description: 'Unusual volume of file downloads',
          detail: `${count} file downloads within 60 minutes.`,
          detected_at: earliest,
          count,
        });
      }
    }

    // ─── 4. BULK DELETION: 5+ deletions by same user in 30 min ───────────────
    const deletionsByUser = groupBy(deletionLogs, (l) => l.user_id);
    for (const [uid, logs] of Object.entries(deletionsByUser)) {
      const { found, count, earliest } = hasCluster(
        logs.map((l) => l.created_at),
        5,
        30 * 60 * 1000
      );
      if (found) {
        const u = userMap.get(uid) ?? { email: uid, name: 'Unknown' };
        events.push({
          id: nextId(),
          type: 'bulk_deletion',
          severity: 'high',
          user_id: uid,
          user_email: u.email,
          user_name: u.name,
          description: 'Bulk deletion of records',
          detail: `${count} deletions within 30 minutes.`,
          detected_at: earliest,
          count,
        });
      }
    }

    // ─── 5. IP HOPPING: same user, 3+ different IPs in 60 min ────────────────
    const loginsByUser = groupBy(successLogins, (l) => l.user_id);
    for (const [uid, logs] of Object.entries(loginsByUser)) {
      // Slide 60-min windows
      const sorted = [...logs].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      for (let i = 0; i < sorted.length; i++) {
        const windowStart = new Date(sorted[i].created_at).getTime();
        const inWindow = sorted.filter(
          (l) => new Date(l.created_at).getTime() - windowStart <= 60 * 60 * 1000
        );
        const uniqueIPs = new Set(inWindow.map((l) => l.ip_address).filter(Boolean));
        if (uniqueIPs.size >= 3) {
          const u = userMap.get(uid) ?? { email: uid, name: 'Unknown' };
          events.push({
            id: nextId(),
            type: 'ip_hopping',
            severity: 'medium',
            user_id: uid,
            user_email: u.email,
            user_name: u.name,
            description: 'Login from multiple IP addresses',
            detail: `${uniqueIPs.size} different IP addresses used within 60 minutes: ${[...uniqueIPs].join(', ')}.`,
            detected_at: sorted[i].created_at,
            count: uniqueIPs.size,
          });
          break; // One flag per user
        }
      }
    }

    // Sort: high first, then by detected_at desc
    const severityOrder = { high: 0, medium: 1, low: 2 };
    events.sort((a, b) => {
      const sd = severityOrder[a.severity] - severityOrder[b.severity];
      if (sd !== 0) return sd;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });

    return NextResponse.json({ events, scanned_since: since });
  } catch (err) {
    console.error('[Suspicious Activity] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
