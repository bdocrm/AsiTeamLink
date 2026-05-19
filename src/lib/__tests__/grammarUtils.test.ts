import { describe, it, expect } from 'vitest';
import { applySuggestionToText, applyAllSuggestionsToText, normalizeMatch } from '../grammarUtils';

describe('grammar utils', () => {
  it('applies a simple suggestion by offset', () => {
    const text = 'Hello worl';
    const match = normalizeMatch({ offset: 6, length: 4, replacements: [{ value: 'world' }] });
    const out = applySuggestionToText(text, match, 'world');
    expect(out).toBe('Hello world');
  });

  it('falls back to context when offset is out of bounds', () => {
    const text = 'This are wrong sentence.';
    const match = normalizeMatch({ offset: 1000, length: 3, context: { text: 'This are wrong sentence.', offset: 5, length: 3 } });
    const out = applySuggestionToText(text, match, 'is');
    expect(out).toBe('This is wrong sentence.');
  });

  it('appends replacement when context not found', () => {
    const text = 'Short';
    const match = normalizeMatch({ offset: -1, length: 2, context: { text: 'NotPresent', offset: 0, length: 2 } });
    const out = applySuggestionToText(text, match, 'X');
    expect(out).toBe('Short X');
  });

  it('applies multiple suggestions correctly (non-overlapping)', () => {
    const text = 'The quick broun fox';
    const matches = [
      normalizeMatch({ offset: 10, length: 5, replacements: [{ value: 'brown' }] }),
      normalizeMatch({ offset: 16, length: 3, replacements: [{ value: 'fox' }] }),
    ];
    const out = applyAllSuggestionsToText(text, matches);
    expect(out).toBe('The quick brown fox');
  });

  it('applies multiple suggestions with overlapping offsets safely', () => {
    const text = 'A bad example';
    // Two suggestions overlapping; ensure descending order application
    const matches = [
      normalizeMatch({ offset: 2, length: 3, replacements: [{ value: 'good' }] }), // replaces 'bad' -> 'good'
      normalizeMatch({ offset: 0, length: 1, replacements: [{ value: 'An' }] }),
    ];
    const out = applyAllSuggestionsToText(text, matches);
    expect(out).toBe('An good example');
  });
});
