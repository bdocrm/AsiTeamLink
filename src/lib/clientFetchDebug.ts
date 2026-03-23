// Client-side fetch debugger — wrap window.fetch to log requests/responses
// Only runs in browser (import from client components)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export function enableClientFetchDebug() {
  if (typeof window === 'undefined' || !window.fetch) return;
  try {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo, init?: RequestInit) => {
      try {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        const isSupabase = SUPABASE_URL && url.includes(SUPABASE_URL);
        if (isSupabase) {
          console.groupCollapsed('fetch-debug ->', init?.method || 'GET', url);
          try {
            if (init?.body && typeof init.body !== 'string') {
              // attempt to read FormData keys
              if (init.body instanceof FormData) {
                const keys: string[] = [];
                init.body.forEach((v, k) => keys.push(k));
                console.log('Request FormData keys:', keys);
              } else {
                console.log('Request body (not string):', init.body);
              }
            } else if (init?.body) {
              console.log('Request body:', init.body);
            }
          } catch (e) {
            console.warn('Failed to inspect request body', e);
          }
        }

        const response = await originalFetch(input, init);

        if (isSupabase) {
          try {
            const clone = response.clone();
            const text = await clone.text();
            let parsed;
            try { parsed = JSON.parse(text); } catch { parsed = text; }
            console.log('Response status:', response.status, parsed);
          } catch (e) {
            console.warn('Failed to read response body', e);
          }
          console.groupEnd();
        }

        return response;
      } catch (err) {
        console.error('fetch-debug error:', err);
        return originalFetch(input, init);
      }
    };
    console.info('Client fetch debug enabled for', SUPABASE_URL || 'no NEXT_PUBLIC_SUPABASE_URL');
  } catch (err) {
    // ignore
    // eslint-disable-next-line no-console
    console.warn('Could not enable fetch debug', err);
  }
}

export default enableClientFetchDebug;
