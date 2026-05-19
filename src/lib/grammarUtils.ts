export interface MatchContext { text?: string; offset?: number; length?: number }
export interface SuggestionMatch {
  offset?: number;
  length?: number;
  replacements?: Array<{ value?: string } | string>;
  context?: MatchContext;
  [k: string]: any;
}

export function normalizeMatch(m: any): SuggestionMatch {
  return {
    ...m,
    offset: typeof m.offset === 'number' ? m.offset : (m?.context?.offset ?? 0),
    length: typeof m.length === 'number' ? m.length : (m?.context?.length ?? 0),
    replacements: Array.isArray(m.replacements) ? m.replacements : (m.replacements ? [m.replacements] : []),
    context: m.context || {},
  };
}

export function applySuggestionToText(text: string, match: SuggestionMatch, replacement: string): string {
  const current = text || '';
  let offset = Number(match.offset ?? match.context?.offset ?? 0);
  let length = Number(match.length ?? match.context?.length ?? 0);

  if (offset < 0 || offset + length > current.length) {
    const ctx = String(match?.context?.text || '').trim();
    if (ctx) {
      const found = current.indexOf(ctx);
      if (found >= 0) {
        offset = found + Number(match?.context?.offset ?? 0);
        length = Number(match?.context?.length ?? length);
      } else {
        return current + (current ? ' ' : '') + replacement;
      }
    } else {
      return current + (current ? ' ' : '') + replacement;
    }
  }

  const before = current.slice(0, offset);
  const after = current.slice(offset + length);
  return before + replacement + after;
}

export function applyAllSuggestionsToText(text: string, matches: SuggestionMatch[]): string {
  if (!matches || matches.length === 0) return text;
  const normalized = matches.map(normalizeMatch).slice();
  normalized.sort((a, b) => Number(b.offset ?? 0) - Number(a.offset ?? 0));
  let newText = text || '';
  for (const m of normalized) {
    const repRaw = (m.replacements && m.replacements[0]) || null;
    const rep = repRaw ? (typeof repRaw === 'string' ? repRaw : (repRaw.value || String(repRaw))) : null;
    if (!rep) continue;
    const off = Number(m.offset ?? m.context?.offset ?? 0);
    const len = Number(m.length ?? m.context?.length ?? 0);
    if (off < 0 || off > newText.length) continue;
    newText = newText.slice(0, off) + rep + newText.slice(off + len);
  }
  return newText;
}
