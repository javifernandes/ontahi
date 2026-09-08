import { redo, undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { isJsonValue } from '@ontahi/core';
import {
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  entity,
  field,
} from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolResponse,
  type RuntimeProtocolRequestEnvelope,
} from '@ontahi/core/runtime/protocol';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Effect } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ConsolePanel } from './console-panel.js';

const originalRangeGetClientRects = Range.prototype.getClientRects;
beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
});
afterAll(() => {
  if (originalRangeGetClientRects)
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: originalRangeGetClientRects,
    });
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
});
afterEach(cleanup);

const Tag = entity('Tag', { id: field.id(), name: field.string(), active: field.boolean() });
const Other = entity('Other', { id: field.id(), name: field.string() });
const rows = [
  { id: 't-z', name: 'Zulu', active: true },
  { id: 't-m', name: 'Middle', active: true },
  { id: 't-a', name: 'Alpha', active: true },
  { id: 't-hidden', name: 'A hidden', active: false },
];

const mountConsole = (source = 'Tag.where(active = true).limit(2).many()') => {
  const runtime = createInMemoryDataGraphRuntime({ dataset: { Tag: rows }, entities: [Tag] });
  const dispatch = createGraphReadDispatcher({
    policies: [
      {
        entity: Tag,
        modes: ['run', 'get', 'count'],
        cardinalities: ['many', 'one'],
        maxLimit: 50,
        scope: 'all',
        fields: {
          id: { select: true },
          name: { select: true, filter: ['eq'], order: true },
          active: { select: true, filter: ['eq'] },
        },
      },
    ],
    execute: (query, mode) =>
      Effect.runPromise(
        mode === 'run'
          ? runtime.run(query, undefined)
          : mode === 'get'
            ? runtime.get(query, undefined)
            : runtime.count(query, undefined),
      ),
  });
  const respond = async (envelope: RuntimeProtocolRequestEnvelope) => {
    const body = await dispatch(envelope.body, { authority: undefined });
    if (!isJsonValue(body)) throw new Error('Expected a portable Graph Read response.');
    return createRuntimeProtocolResponse(envelope, body);
  };
  const request = vi.fn(respond);
  render(
    <ConsolePanel
      options={{ entities: [Tag, Other], initialDocument: source }}
      runtimeTransport={{ request }}
    />,
  );
  const editor = screen.getByRole('textbox', { name: 'Ontahí Console expression' });
  const view = EditorView.findFromDOM(editor)!;
  const replaceSource = (next: string) =>
    act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    });
  const result = within(screen.getByLabelText('Console result'));
  const visibleNames = () =>
    result
      .getAllByRole('row')
      .slice(1)
      .map(row => within(row).getAllByRole('cell')[1]!.textContent);
  return { request, respond, view, replaceSource, result, visibleNames };
};

describe('Console bidirectional Query ordering', () => {
  it('edits the source and executes server ordering before the limit, with an undoable sort cycle', async () => {
    const source = '  Tag.where(active = true)\n .limit(2).many()';
    const { request, view, result, visibleNames } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    expect(visibleNames()).toEqual(['Zulu', 'Middle']);
    act(() => view.dispatch({ selection: { anchor: source.indexOf('active') } }));
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha', 'Middle']));
    const ascSource = '  Tag.where(active = true).orderBy(name)\n .limit(2).many()';
    expect(view.state.doc.toString()).toBe(ascSource);
    expect(view.state.selection.main.head).toBe(source.indexOf('active'));
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]![0].body).toMatchObject({
      orderBy: [{ fieldName: 'name', direction: 'asc' }],
      limit: 2,
      selection: {
        expression: { kind: 'predicate', fieldName: 'active', operator: 'eq', value: true },
      },
    });

    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(source);
    expect(result.getByText(/Changes not run/)).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(2);
    expect(visibleNames()).toEqual(['Alpha', 'Middle']);
    act(() => {
      expect(redo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(ascSource);
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await waitFor(() => expect(visibleNames()).toEqual(['Zulu', 'Middle']));
    expect(view.state.doc.toString()).toBe(
      ascSource.replace('orderBy(name)', 'orderBy(name, desc)'),
    );
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    await result.findByText('Result matches the executed query.');
    expect(view.state.doc.toString()).toBe(source);
    expect(result.getByRole('columnheader', { name: 'name' }).hasAttribute('aria-sort')).toBe(
      false,
    );
  });

  it('reflects textual ordering only after Run and disables controls for unsafe drafts', async () => {
    const { request, view, replaceSource, result, visibleNames } = mountConsole(
      'Tag.orderBy(name, desc).limit(2).many()',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    expect(visibleNames()).toEqual(['Zulu', 'Middle']);
    replaceSource('Tag.orderBy(name).limit(2).many()');
    expect(request).toHaveBeenCalledOnce();
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    expect(result.getByText(/Changes not run/)).toBeTruthy();
    for (const draft of ['Tag.orderBy(', 'Other.many()', 'Tag.first()', 'Tag.count()']) {
      replaceSource(draft);
      const sort = result.getByRole('button', { name: 'Sort by name' }) as HTMLButtonElement;
      expect(sort.disabled).toBe(true);
      fireEvent.click(sort);
      expect(view.state.doc.toString()).toBe(draft);
      expect(request).toHaveBeenCalledOnce();
    }
    replaceSource('Tag.orderBy(name).limit(2).many()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(visibleNames()).toEqual(['A hidden', 'Alpha']));
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
  });

  it('keeps the last executed snapshot during a pending request, without overwriting newer edits', async () => {
    const { request, respond, view, replaceSource, result, visibleNames } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    request.mockImplementationOnce(async envelope => {
      await pending;
      return respond(envelope);
    });
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    expect(visibleNames()).toEqual(['Zulu', 'Middle']);
    expect(
      (result.getByRole('button', { name: 'Sort by name' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    replaceSource('Tag.where(active = false).many()');
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => {
      release();
      await pending;
    });
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha', 'Middle']));
    expect(view.state.doc.toString()).toBe('Tag.where(active = false).many()');
    expect(result.getByText(/Changes not run/)).toBeTruthy();
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    expect(result.getByText('Tag.where(active = true).orderBy(name).limit(2).many()')).toBeTruthy();
  });

  it('preserves results and executed ordering when policy or transport rejects a new sort', async () => {
    const { request, view, result, visibleNames } = mountConsole(
      'Tag.orderBy(name).limit(2).many()',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    fireEvent.click(result.getByRole('button', { name: 'Sort by id' }));
    expect(await result.findByRole('alert')).toHaveProperty(
      'textContent',
      'Ordering by Tag.id is not allowed by the Graph Read policy.',
    );
    expect(view.state.doc.toString()).toBe('Tag.orderBy(id).limit(2).many()');
    expect(visibleNames()).toEqual(['A hidden', 'Alpha']);
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    request.mockRejectedValueOnce(new Error('Connection lost'));
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await waitFor(() => expect(result.getByRole('alert').textContent).toBe('Connection lost'));
    expect(visibleNames()).toEqual(['A hidden', 'Alpha']);
    expect(request).toHaveBeenCalledTimes(3);
    fireEvent.click(result.getByRole('button', { name: 'JSON' }));
    expect(result.getByText('"A hidden"')).toBeTruthy();
  });

  it('keeps sortable reflected headers when a valid query returns no rows', async () => {
    const { view, result, request } = mountConsole('Tag.where(name = "Missing").limit(2).many()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByText('Empty list');
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await result.findByText('Result matches the executed query.');
    expect(view.state.doc.toString()).toBe(
      'Tag.where(name = "Missing").orderBy(name).limit(2).many()',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
});
