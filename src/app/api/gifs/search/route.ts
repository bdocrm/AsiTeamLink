import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GIPHY_API_KEY not configured', data: [] },
      { status: 200 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const limit = searchParams.get('limit') || '20';

  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(query)}&limit=${limit}&api_key=${apiKey}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('Giphy search error:', response.status, text);
      throw new Error(`Giphy API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('GIF search error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch GIFs', data: [] },
      { status: 200 }
    );
  }
}
