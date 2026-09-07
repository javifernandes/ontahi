import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExplorerSelectionLanguageEditor } from './selection-language-editor.js';

const TodoItem = {
  name: 'TodoItem',
  fields: [{ name: 'completed', type: 'boolean', nullable: false }],
} as const;

afterEach(cleanup);

describe('ExplorerSelectionLanguageEditor', () => {
  it('hosts a controlled CodeMirror document with an accessible label', async () => {
    const onChange = vi.fn();
    const rendered = render(
      <ExplorerSelectionLanguageEditor
        label='Selection expression for TodoItem'
        value='completed = false'
        entity={TodoItem}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText('Selection expression for TodoItem').textContent).toContain(
      'completed = false',
    );

    rendered.rerender(
      <ExplorerSelectionLanguageEditor
        label='TodoItem filter'
        value='completed = true'
        entity={TodoItem}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('TodoItem filter').textContent).toContain('completed = true');
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
