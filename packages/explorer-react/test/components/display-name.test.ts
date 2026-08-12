import { describe, expect, it } from 'vitest';

import { humanizeExplorerName } from '../../src/components/index.js';

describe('humanizeExplorerName', () => {
  it('formats camelCase task names into readable titles', () => {
    expect(humanizeExplorerName('internalImportFromGithubMarkdown')).toBe(
      'Internal Import From Github Markdown',
    );
  });

  it('preserves acronyms and splits separator-based names', () => {
    expect(humanizeExplorerName('sync_HTTP_events-now')).toBe('Sync HTTP Events Now');
  });
});
