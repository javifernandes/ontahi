// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { Explorer } from './Explorer.js';

vi.mock('@ontahi/explorer-react/components', async importOriginal => {
  const components = await importOriginal<typeof import('@ontahi/explorer-react/components')>();
  return {
    ...components,
    // Keep the real provider and editor; omit unrelated entity loading and canvas layout.
    ExplorerEntityBrowser: () => (
      <components.ExplorerSelectionLanguageEditor
        label='Query'
        value='completed = false'
        onChange={() => {}}
        entity={{
          name: 'TodoItem',
          fields: [{ name: 'completed', type: 'boolean', nullable: false }],
        }}
      />
    ),
  };
});

afterEach(() => vi.unstubAllGlobals());

it('uses light query colors on the light Todo host even when the system prefers dark', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ snapshot: { operations: [], tasks: [] }, entityDetails: [] }),
    }),
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Explorer />));
    const field = container.querySelector('.cm-ontahi-semantic-field')!;
    const operator = container.querySelector('.cm-ontahi-semantic-operator')!;
    expect(field.textContent).toBe('completed');
    expect(getComputedStyle(field).color).toBe('rgb(22, 61, 42)');
    expect(getComputedStyle(operator).color).toBe('rgb(14, 99, 114)');
    expect(container.querySelector('select')?.value).toBe('false');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
