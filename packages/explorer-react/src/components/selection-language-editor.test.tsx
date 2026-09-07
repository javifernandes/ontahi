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

  it('reconfigures semantic assistance when the selected Entity changes', async () => {
    const onChange = vi.fn();
    const rendered = render(
      <ExplorerSelectionLanguageEditor
        label='Selection expression for TodoItem'
        value='completed = false'
        entity={TodoItem}
        onChange={onChange}
      />,
    );

    expect(rendered.container.querySelector('.cm-ontahi-semantic-field')?.textContent).toBe(
      'completed',
    );

    rendered.rerender(
      <ExplorerSelectionLanguageEditor
        label='Selection expression for ArchiveItem'
        value='completed = false'
        entity={{
          name: 'ArchiveItem',
          fields: [{ name: 'archived', type: 'boolean', nullable: false }],
        }}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(rendered.container.querySelector('.cm-ontahi-semantic-invalid')?.textContent).toBe(
        'completed',
      );
    });
    expect(rendered.container.querySelector('.cm-ontahi-semantic-field')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
