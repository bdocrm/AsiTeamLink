import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Missing Supabase env' }, { status: 500 });
    }

    const cookieStore = await cookies();
    const serverSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    });

    const { data: authData } = await serverSupabase.auth.getUser();
    const authUser = authData?.user;
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle();
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    const dbStart = Date.now();
    const dbProbe = await adminSupabase.from('users').select('id', { count: 'exact', head: true });
    const dbLatencyMs = Date.now() - dbStart;
    const dbOk = !dbProbe.error;

    const maxScan = 5000;
    const pageSize = 100;
    let scanned = 0;
    let totalBytes = 0;
    let isEstimate = false;
    let note: string | null = null;

    const { data: buckets, error: bucketErr } = await adminSupabase.storage.listBuckets();
    if (bucketErr) {
      return NextResponse.json({
        ok: true,
        db: { ok: dbOk, latency_ms: dbLatencyMs },
        storage: {
          bytes: null,
          scanned_objects: 0,
          is_estimate: true,
          note: `Storage scan failed: ${bucketErr.message}`,
        },
      });
    }

    for (const bucket of buckets || []) {
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: objects, error: objErr } = await adminSupabase.storage.from(bucket.name).list('', {
          limit: pageSize,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });

        if (objErr) {
          isEstimate = true;
          note = `Storage scan partial: ${objErr.message}`;
          hasMore = false;
          continue;
        }

        const list = objects || [];
        for (const obj of list as { metadata?: { size?: number | string } }[]) {
          const raw = obj?.metadata?.size;
          const n = typeof raw === 'string' ? Number(raw) : Number(raw || 0);
          if (Number.isFinite(n) && n > 0) totalBytes += n;
        }
        scanned += list.length;
        offset += list.length;

        if (scanned >= maxScan) {
          isEstimate = true;
          note = `Reached scan cap (${maxScan} objects). Value is estimated.`;
          hasMore = false;
          break;
        }
        if (list.length < pageSize) {
          hasMore = false;
        }
      }
      if (scanned >= maxScan) break;
    }

    return NextResponse.json({
      ok: true,
      db: { ok: dbOk, latency_ms: dbLatencyMs },
      storage: {
        bytes: totalBytes,
        scanned_objects: scanned,
        is_estimate: isEstimate,
        note,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
