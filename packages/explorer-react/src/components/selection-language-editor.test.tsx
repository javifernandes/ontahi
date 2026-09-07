import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createExplorerSelectionReferenceValueProvider,
  ExplorerSelectionLanguageEditor,
} from './selection-language-editor.js';

const TodoItem = {
  name: 'TodoItem',
  fields: [{ name: 'completed', type: 'boolean', nullable: false }],
} as const;

const ReferencedTodoItem = {
  name: 'TodoItem',
  fields: [
    {
      name: 'list',
      type: 'reference',
      nullable: false,
      reference: {
        entityName: 'TodoList',
        identity: { name: 'refById', fields: ['id'] },
      },
    },
  ],
} as const;

afterEach(cleanup);

describe('ExplorerSelectionLanguageEditor', () => {
  it('adapts the reflected Entity reader into Reference search and identity resolution', async () => {
    const readEntityData = vi.fn().mockImplementation(async request => ({
      entityName: 'TodoList',
      columns: [],
      display: { primary: 'name', secondary: ['color'] },
      rows:
        request.search !== undefined
          ? [{ id: 'list-inbox', name: 'Inbox', color: 'Red' }]
          : [{ id: 'list-inbox', name: 'Inbox', color: 'Red' }],
      page: 1,
      pageSize: request.pageSize,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    }));
    const provider = createExplorerSelectionReferenceValueProvider({ readEntityData });

    await expect(
      provider.search({
        fieldName: 'list',
        targetEntityName: 'TodoList',
        identityField: 'id',
        query: 'inb',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual([{ value: 'list-inbox', label: 'Inbox', detail: 'Red' }]);
    await expect(
      provider.resolve({
        fieldName: 'list',
        targetEntityName: 'TodoList',
        identityField: 'id',
        value: 'list-inbox',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ value: 'list-inbox', label: 'Inbox', detail: 'Red' });
    expect(readEntityData).toHaveBeenNthCalledWith(1, {
      entityName: 'TodoList',
      search: 'inb',
      page: 1,
      pageSize: 6,
    });
    expect(readEntityData).toHaveBeenNthCalledWith(2, {
      entityName: 'TodoList',
      filters: [{ field: 'id', operator: 'equals', value: 'list-inbox' }],
      page: 1,
      pageSize: 1,
    });
  });

  it('shows a resolved Reference label while preserving the controlled identity document', async () => {
    const onChange = vi.fn();
    const referenceValues = {
      search: vi.fn().mockResolvedValue([]),
      resolve: vi.fn().mockResolvedValue({
        value: 'list-inbox',
        label: 'Inbox',
        detail: '#f5ddd5',
      }),
    };
    render(
      <ExplorerSelectionLanguageEditor
        label='Selection expression for TodoItem'
        value='list = "list-inbox"'
        entity={ReferencedTodoItem}
        referenceValues={referenceValues}
        onChange={onChange}
      />,
    );

    const reference = await screen.findByRole('button', {
      name: 'Value for TodoItem.list: Inbox, list-inbox',
    });
    expect(reference.textContent).toBe('Inboxlist-inbox');
    expect(screen.getByLabelText('Selection expression for TodoItem').textContent).toContain(
      'list = ',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opts into finite projections while keeping document changes host-controlled', () => {
    const onChange = vi.fn();
    render(
      <ExplorerSelectionLanguageEditor
        label='Selection expression for TodoItem'
        value='completed = false'
        entity={TodoItem}
        onChange={onChange}
      />,
    );

    const control = screen.getByRole('combobox', { name: 'Value for TodoItem.completed' });
    const help = screen.getByRole('button', { name: 'Selection editor help' });
    expect(help.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Ctrl-Space for suggestions. Hover a Field or operator for details. Press Escape on a value control to edit its source text.',
    );
    expect((control as HTMLSelectElement).value).toBe('false');
    fireEvent.change(control, { target: { value: 'true' } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('completed = true');
  });

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
      'completed = ',
    );
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Value for TodoItem.completed',
        }) as HTMLSelectElement
      ).value,
    ).toBe('false');

    rendered.rerender(
      <ExplorerSelectionLanguageEditor
        label='TodoItem filter'
        value='completed = true'
        entity={TodoItem}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(
        (
          screen.getByRole('combobox', {
            name: 'Value for TodoItem.completed',
          }) as HTMLSelectElement
        ).value,
      ).toBe('true');
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
