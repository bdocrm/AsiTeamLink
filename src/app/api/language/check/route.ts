import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = (body && body.text) || '';
    const language = (body && body.language) || 'en-US';

    if (!text || String(text).trim().length === 0) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const params = new URLSearchParams();
    params.append('text', String(text));
    params.append('language', String(language));

    // Use LanguageTool public API as a simple spell/grammar backend
    const resp = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
