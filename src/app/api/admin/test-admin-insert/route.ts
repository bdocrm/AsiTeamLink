import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';

// Temporary endpoint to validate admin (service-role) client INSERT permissions.
// Protect with a short-lived token set via `DEV_ADMIN_TEST_TOKEN` environment variable.
export async function POST(req: Request) {
  try {
    const reqHeaders = headers();
    const token = reqHeaders.get('x-admin-test-token') || reqHeaders.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const expected = process.env.DEV_ADMIN_TEST_TOKEN || '';
    if (!expected) {
      return NextResponse.json({ error: 'DEV_ADMIN_TEST_TOKEN not configured on server' }, { status: 500 });
    }
    if (!token || token !== expected) {
      return NextResponse.json({ error: 'Unauthorized (invalid test token)' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const campaign_id = body?.campaign_id || body?.campaignId;
    const text = body?.body || body?.text || 'Test announcement from admin test endpoint';
    if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });

    const admin = createAdminClient();
    console.log('Test admin insert: service role present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log('Attempting insert for campaign_id:', campaign_id);

    const res = await admin.from('announcements').insert({ campaign_id, title: body?.title || 'Test insert', body: text, created_by: null }).select().single();
    if (res.error) {
      console.error('Admin test insert failed:', res.error);
      return NextResponse.json({ error: res.error.message || 'Insert failed', debug: res }, { status: 500 });
    }

    return NextResponse.json({ data: res.data });
  } catch (err: any) {
    console.error('Unhandled admin test insert error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ ok: true, info: 'POST to this endpoint with x-admin-test-token and { campaign_id } to try admin INSERT.' });
}
