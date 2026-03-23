"use client";

import { useEffect } from 'react';

// Small dev-only error filter to suppress noisy extension/service-worker errors
export default function DevErrorFilter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      try {
        const msg = ev?.message || '';
        const filename = ev?.filename || '';
        // Quietly ignore Cache API errors for chrome-extension scheme coming from sw.js (browser extensions)
        if (msg.includes("Request scheme 'chrome-extension' is unsupported") || /sw\.js$/.test(filename)) {
          // prevent default logging to console (keeps dev console cleaner)
          ev.preventDefault();
          console.warn('Suppressed extension/service-worker error:', msg, filename);
        }
      } catch (e) {
        // swallow
      }
    };

    const onRejection = (ev: PromiseRejectionEvent) => {
      try {
        const reason = ev?.reason;
        const msg = typeof reason === 'string' ? reason : (reason?.message || '');
        if (String(msg).includes("Request scheme 'chrome-extension' is unsupported")) {
          ev.preventDefault();
          console.warn('Suppressed extension/service-worker promise rejection:', msg);
        }
      } catch (e) {}
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
