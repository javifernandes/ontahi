import { describe, expect, it } from 'vitest';

import { humanizeExplorerName } from './index.js';

describe('humanizeExplorerName', () => {
  it('formats camelCase task names into readable titles', () => {
    expect(humanizeExplorerName('internalImportFromGithubMarkdown')).toBe(
      'Internal Import From Github Markdown',
    );
  });

  it('preserves acronyms and splits separator-based names', () => {
    expect(humanizeExplorerName('sync_HTTP_events-now')).toBe('Sync HTTP Events Now');
  });

  it('splits acronym boundaries without regular-expression backtracking', () => {
    expect(humanizeExplorerName('parseXMLHttpResponse')).toBe('Parse XML Http Response');
    expect(humanizeExplorerName(`${'A'.repeat(10_000)}a`)).toBe(`${'A'.repeat(9_999)} Aa`);
  });
});
