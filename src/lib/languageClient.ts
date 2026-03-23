export async function checkText(text: string, language = 'en-US') {
  const res = await fetch('/api/language/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(errText || 'Check API failed');
  }
  return res.json();
}
