import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    // Try common headers for forwarded IPs
    const forwarded = req.headers.get('x-forwarded-for');
    let ip = '';
    if (forwarded) {
      ip = forwarded.split(',')[0].trim();
    } else {
      // Fallback to connection remote address when available
      // Note: in many serverless environments this may be empty
      const cfConnectingIp = req.headers.get('cf-connecting-ip');
      if (cfConnectingIp) ip = cfConnectingIp;
    }

    return NextResponse.json({ ip });
  } catch (err) {
    return NextResponse.json({ ip: '' });
  }
}
