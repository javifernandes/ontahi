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
  type RuntimeProtocolResponseEnvelope,
} from '@ontahi/core/runtime/protocol';
import { consoleExpressionDialect } from '@ontahi/language-codemirror';
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

describe('Console dialect switching', () => {
  it('converts without executing and restores exact source plus parser on undo/redo', async () => {
    const source = '  Tag.where( active = true ).limit(2).many()  ';
    const { view, request, result } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    expect(view.state.doc.toString()).toBe('Tag where active = true limit 2 many');
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    expect(screen.getByRole('button', { name: 'Declarative' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(request).toHaveBeenCalledOnce();
    expect(result.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('combobox', { name: 'Value for Tag.active' })).toBeDefined();
    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe(source);
    expect(view.state.field(consoleExpressionDialect)).toBe('ts');
    expect(screen.getByRole('button', { name: 'TS' }).getAttribute('aria-pressed')).toBe('true');
    act(() => {
      redo(view);
    });
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    expect(request).toHaveBeenCalledOnce();
  });

  it('runs declarative source with rich values and receiver-backed sort/limit edits', async () => {
    const { view, request, result, visibleNames, applyLimit } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    fireEvent.click(result.getByRole('button', { name: /Sort by name/ }));
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha', 'Middle']));
    expect(view.state.doc.toString()).toBe('Tag where active = true order by name limit 2 many');
    applyLimit(1);
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha']));
    expect(view.state.doc.toString()).toBe('Tag where active = true order by name limit 1 many');
    expect(request).toHaveBeenCalledTimes(3);
    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe('Tag where active = true order by name limit 2 many');
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    expect(result.getByRole('status').textContent).toBe('Changes not run');
    fireEvent.change(screen.getByRole('combobox', { name: 'Value for Tag.active' }), {
      target: { value: 'false' },
    });
    expect(view.state.doc.toString()).toContain('active = false');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('keeps invalid drafts untouched and allows switching an empty editor', () => {
    const { view, replaceSource, request } = mountConsole('Tag.where(active =');
    const button = screen.getByRole('button', { name: 'Declarative' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('Fix the expression');
    fireEvent.click(button);
    expect(view.state.doc.toString()).toBe('Tag.where(active =');
    replaceSource('   ');
    fireEvent.click(button);
    expect(view.state.doc.toString()).toBe('   ');
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    act(() => {
      undo(view);
    });
    expect(view.state.field(consoleExpressionDialect)).toBe('ts');
    expect(request).not.toHaveBeenCalled();
  });

  it('preserves pending exists intent when switching dialect and editing the new draft', async () => {
    const { request, respond, replaceSource, result, view } = mountConsole('Tag.exists()');
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    request.mockImplementationOnce(async envelope => {
      await pending;
      return respond(envelope);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    replaceSource('Tag first');
    await act(async () => {
      release();
      await pending;
    });
    await result.findByText('true');
    expect(view.state.doc.toString()).toBe('Tag first');
    expect(result.getByRole('status').textContent).toBe('Changes not run');
    expect(request).toHaveBeenCalledOnce();
  });

  it('supports an initial declarative dialect without requiring an initial document', () => {
    render(<ConsolePanel options={{ entities: [Tag], initialDialect: 'declarative' }} />);
    const view = EditorView.findFromDOM(
      screen.getByRole('textbox', { name: 'Ontahí Console expression' }),
    )!;
    expect(view.state.doc.toString()).toBe('Tag');
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

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
  const respond = async (
    envelope: RuntimeProtocolRequestEnvelope,
  ): Promise<RuntimeProtocolResponseEnvelope> => {
    const body = await dispatch(envelope.body, { authority: undefined });
    if (!isJsonValue(body)) throw new Error('Expected a portable Graph Read response.');
    return createRuntimeProtocolResponse(envelope, body);
  };
  const request = vi.fn(respond);
  const rendered = render(
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
  const switchTransport = () => {
    const nextRequest = vi.fn(respond);
    rendered.rerender(
      <ConsolePanel
        options={{ entities: [Tag, Other], initialDocument: source }}
        runtimeTransport={{ request: nextRequest }}
      />,
    );
    return nextRequest;
  };
  const applyLimit = (limit: number | string) => {
    fireEvent.change(result.getByRole('spinbutton', { name: 'Result limit' }), {
      target: { value: String(limit) },
    });
    fireEvent.submit(result.getByRole('form', { name: 'Query limit' }));
  };
  return {
    request,
    respond,
    view,
    replaceSource,
    result,
    visibleNames,
    switchTransport,
    applyLimit,
  };
};

describe('Console exists reads', () => {
  it.each([
    ['Tag.exists()', true],
    ['Tag.where(active = true).exists()', true],
    ['Tag.where(name = "Missing").exists()', false],
    ['Tag.where(none).exists()', false],
  ])('renders %s as a Boolean in Visual and JSON', async (source, expected) => {
    const { request, result } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByText(String(expected));
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0].body).toMatchObject({ mode: 'get', limit: 1, orderBy: [] });
    expect(request.mock.calls[0]![0].body).not.toHaveProperty('cardinality');
    expect(result.queryByRole('table')).toBeNull();
    expect(result.queryByRole('spinbutton')).toBeNull();
    fireEvent.click(result.getByRole('button', { name: 'JSON' }));
    expect(result.getByText(String(expected)).closest('pre')?.textContent).toBe(String(expected));
  });

  it('keeps the executed exists intent when the editor changes during the read', async () => {
    const { request, respond, replaceSource, result } = mountConsole('Tag.exists()');
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    request.mockImplementationOnce(async envelope => {
      await pending;
      return respond(envelope);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    replaceSource('Tag.first()');
    await act(async () => {
      release();
      await pending;
    });
    await result.findByText('true');
    expect(result.getByRole('status').textContent).toBe('Changes not run');
  });

  it('preserves policy and transport failures instead of turning them into false', async () => {
    const { request, replaceSource, result } = mountConsole('Tag.exists()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByText('true');
    replaceSource('Other.exists()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect((await result.findByRole('alert')).textContent).toBe('Data graph read access denied.');
    expect(result.getByText('true')).toBeTruthy();
    request.mockRejectedValueOnce(new Error('Connection lost'));
    replaceSource('Tag.exists()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('alert').textContent).toBe('Connection lost'));
    expect(result.getByText('true')).toBeTruthy();
  });

  it.each([[[]], [false], [0], ['invalid']])(
    'rejects a malformed nullable get result %j',
    async value => {
      const { request, result } = mountConsole('Tag.exists()');
      request.mockImplementationOnce(async envelope =>
        createRuntimeProtocolResponse(envelope, {
          version: 1,
          kind: 'graph-read-result',
          value,
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      expect((await result.findByRole('alert')).textContent).toBe(
        'Graph Read exists expected an Entity record or null.',
      );
      expect(result.queryByText('true')).toBeNull();
      expect(result.queryByText('false')).toBeNull();
    },
  );
});

describe('Console bidirectional Query limit', () => {
  it('keeps result chrome in one toolbar without repeating the query or success status', async () => {
    const { result } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const toolbar = within(result.getByRole('group', { name: 'Console result toolbar' }));
    expect(toolbar.getByRole('spinbutton', { name: 'Result limit' })).toBeTruthy();
    expect(toolbar.getByRole('button', { name: 'JSON' })).toBeTruthy();
    expect(toolbar.getByLabelText('Last query duration').textContent).toMatch(/^\d+ ms$/);
    expect(result.queryByText('Executed query')).toBeNull();
    expect(result.queryByText('Result matches the executed query.')).toBeNull();
    expect(result.queryByText('success')).toBeNull();
    expect(result.queryByText(/returned rows · executed limit/)).toBeNull();
    expect(toolbar.queryByRole('button', { name: 'Apply limit' })).toBeNull();
    fireEvent.click(toolbar.getByRole('button', { name: 'JSON' }));
    expect(toolbar.getByRole('spinbutton')).toBeTruthy();
  });

  it('resets an unapplied toolbar limit when rerunning the source', async () => {
    const source = '  Tag.where(active = true) .orderBy(name, desc) .many()';
    const { request, view, result } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '25');
    expect(result.getAllByRole('row')).toHaveLength(4);
    fireEvent.change(result.getByRole('spinbutton'), { target: { value: '7' } });
    expect(request).toHaveBeenCalledOnce();
    expect(view.state.doc.toString()).toBe(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '25'));
    expect(request).toHaveBeenCalledTimes(2);
    expect(view.state.doc.toString()).toBe(source);
  });

  it('edits the current draft limit, preserving filters, order and undo history', async () => {
    const source = '  Tag.where(active = true) .orderBy(name, desc) .many()';
    const { request, view, replaceSource, result, visibleNames, applyLimit } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    request.mockClear();
    const draft = source.replace('desc', 'asc');
    replaceSource(draft);
    applyLimit(2);
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha', 'Middle']));
    const edited = draft.replace(') .many()', ').limit(2) .many()');
    expect(view.state.doc.toString()).toBe(edited);
    expect(result.getByRole('spinbutton', { name: 'Result limit' })).toHaveProperty('value', '2');
    expect(request.mock.calls[0]![0].body).toMatchObject({
      limit: 2,
      orderBy: [{ fieldName: 'name', direction: 'asc' }],
    });
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(draft);
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    expect(result.getAllByRole('row')).toHaveLength(3);
    expect(request).toHaveBeenCalledOnce();
    act(() => {
      expect(redo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(edited);
  });

  it('applies a zero limit to the source and renders an empty result', async () => {
    const source = '  Tag.where(active = true) .orderBy(name, asc).limit(2) .many()';
    const { view, result, applyLimit } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    applyLimit(0);
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '0'));
    expect(view.state.doc.toString()).toBe(source.replace('limit(2)', 'limit(0)'));
    expect(result.getByText('Empty list')).toBeTruthy();
  });

  it('rejects invalid toolbar limit values without executing a read', async () => {
    const { request, result, applyLimit } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    for (const value of ['', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) applyLimit(value);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    'Tag.limit(',
    'Other.many()',
    'Tag.first()',
    'Tag.one()',
    'Tag.count()',
    'Tag.exists()',
  ])('disables toolbar limit edits for the unsafe draft %s', async source => {
    const { request, replaceSource, result, applyLimit } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    replaceSource(source);
    expect(result.getByRole('spinbutton', { name: 'Result limit' })).toHaveProperty(
      'disabled',
      true,
    );
    applyLimit(3);
    expect(request).toHaveBeenCalledOnce();
  });

  it('reflects source limits only after Run and removes the control for scalar results', async () => {
    const { replaceSource, result } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    replaceSource('Tag.limit(3).many()');
    expect(result.getByRole('spinbutton').getAttribute('title')).toContain('Executed limit: 2.');
    expect(result.getAllByRole('row')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '3'));
    expect(result.getAllByRole('row')).toHaveLength(4);
    expect(result.getByRole('spinbutton', { name: 'Result limit' })).toHaveProperty('value', '3');
    replaceSource('Tag.count()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.queryByRole('spinbutton')).toBeNull());
  });

  it('retains executed results and limit on policy or transport failure', async () => {
    const { request, view, result, visibleNames, applyLimit } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const duration = result.getByLabelText('Last query duration').textContent;
    applyLimit(51);
    await result.findByRole('alert');
    expect(result.getByLabelText('Last query duration').textContent).toBe(duration);
    expect(view.state.doc.toString()).toBe('Tag.where(active = true).limit(51).many()');
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    expect(visibleNames()).toEqual(['Zulu', 'Middle']);
    request.mockRejectedValueOnce(new Error('Connection lost'));
    applyLimit(1);
    await waitFor(() => expect(result.getByRole('alert').textContent).toBe('Connection lost'));
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    applyLimit(3);
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '3'));
    expect(result.getAllByRole('row')).toHaveLength(4);
  });

  it('keeps pending limits truthful, preserves newer editor changes and requires current transport', async () => {
    const { request, respond, view, replaceSource, result, applyLimit, switchTransport } =
      mountConsole();
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
    applyLimit(1);
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    expect(result.getAllByRole('row')).toHaveLength(3);
    expect(result.getByRole('spinbutton')).toHaveProperty('disabled', true);
    applyLimit(3);
    expect(request).toHaveBeenCalledTimes(2);
    replaceSource('Tag.where(active = false).many()');
    await act(async () => {
      release();
      await pending;
    });
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '1'));
    expect(result.getAllByRole('row')).toHaveLength(2);
    expect(view.state.doc.toString()).toBe('Tag.where(active = false).many()');
    switchTransport();
    expect(result.getByRole('spinbutton')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '25'));
    expect(result.getAllByRole('row')).toHaveLength(2);
    expect(result.getByRole('spinbutton')).toHaveProperty('disabled', false);
  });
});

describe('Console bidirectional Query ordering', () => {
  it('uses receiver ordering permissions in autocomplete, without restricting manual source', async () => {
    const { view, replaceSource, result } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const source = 'Tag.where(active = true).orderBy().many()';
    replaceSource(source);
    act(() => {
      view.dispatch({ selection: { anchor: source.indexOf('orderBy(') + 'orderBy('.length } });
      view.focus();
    });
    fireEvent.keyDown(view.contentDOM, { key: ' ', code: 'Space', ctrlKey: true });
    const completions = within(await screen.findByRole('listbox'));
    expect(completions.getAllByRole('option').map(option => option.textContent)).toEqual([
      'namestring',
    ]);
    replaceSource('Tag.orderBy(id).many()');
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await result.findByRole('alert')).toHaveProperty(
      'textContent',
      'Ordering by Tag.id is not allowed by the Graph Read policy.',
    );
  });

  it('enables only ordering Fields advertised by the receiver', async () => {
    const { request, view, result } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const id = result.getByRole('button', { name: 'Sort by id' });
    expect(id.getAttribute('aria-disabled')).toBe('true');
    expect(id.getAttribute('title')).toBe(
      'Ordering by Tag.id is not allowed by the Graph Read policy.',
    );
    expect(
      result.getByRole('button', { name: 'Sort by active' }).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled')).toBe(
      'false',
    );
    const source = view.state.doc.toString();
    fireEvent.click(id);
    fireEvent.keyDown(id, { key: 'Enter' });
    id.focus();
    expect(document.activeElement).toBe(id);
    expect(view.state.doc.toString()).toBe(source);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0].body).toHaveProperty('includeCapabilities', true);
  });

  it.each(['transport', 'entity'] as const)(
    'drops open ordering suggestions when the %s changes',
    async change => {
      const { view, replaceSource, result, switchTransport } = mountConsole();
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      await result.findByRole('table');
      const source = 'Tag.orderBy().many()';
      replaceSource(source);
      act(() => {
        view.dispatch({ selection: { anchor: source.indexOf('(') + 1 } });
        view.focus();
      });
      fireEvent.keyDown(view.contentDOM, { key: ' ', code: 'Space', ctrlKey: true });
      const completions = within(await screen.findByRole('listbox'));
      expect(completions.getAllByRole('option').map(option => option.textContent)).toEqual([
        'namestring',
      ]);
      if (change === 'transport') switchTransport();
      else act(() => view.dispatch({ changes: { from: 0, to: 3, insert: 'Other' } }));
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
      expect(view.state.doc.toString()).toBe(
        change === 'transport' ? source : 'Other.orderBy().many()',
      );
    },
  );

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
    await waitFor(() => expect(result.getByRole('status').textContent).toBe(''));
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
      expect(sort.getAttribute('aria-disabled')).toBe('true');
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
    expect(result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
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
    expect(result.getByRole('status').textContent).toBe('Changes not run');
  });

  it('preserves results and executed ordering when policy or transport rejects a new sort', async () => {
    const { request, view, replaceSource, result, visibleNames } = mountConsole(
      'Tag.orderBy(name).limit(2).many()',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    replaceSource('Tag.orderBy(id).limit(2).many()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
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
    expect(result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    replaceSource('Tag.orderBy(name).limit(2).many()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('alert').textContent).toBe('Connection lost'));
    expect(visibleNames()).toEqual(['A hidden', 'Alpha']);
    expect(request).toHaveBeenCalledTimes(3);
    fireEvent.click(result.getByRole('button', { name: 'JSON' }));
    expect(result.getByText('"A hidden"')).toBeTruthy();
  });

  it.each([undefined, null, {}, { orderBy: [1] }])(
    'keeps results but disables sorting when capability metadata is unavailable: %j',
    async capabilities => {
      const { request, view, result } = mountConsole();
      request.mockImplementationOnce(async envelope => {
        const body = {
          kind: 'graph-read-result',
          value: rows,
          ...(capabilities === undefined ? {} : { capabilities }),
        };
        if (!isJsonValue(body)) throw new Error('Expected portable test metadata.');
        return createRuntimeProtocolResponse(envelope, body);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      await result.findByRole('table');
      const name = result.getByRole('button', { name: 'Sort by name' });
      expect(name.getAttribute('aria-disabled')).toBe('true');
      expect(name.getAttribute('title')).toContain('Ordering permissions unavailable');
      const source = view.state.doc.toString();
      fireEvent.click(name);
      expect(view.state.doc.toString()).toBe(source);
      expect(request).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      await waitFor(() =>
        expect(
          result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled'),
        ).toBe('false'),
      );
    },
  );

  it('does not reuse capability metadata after replacing the transport', async () => {
    const { request, result, switchTransport } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const nextRequest = switchTransport();
    const name = result.getByRole('button', { name: 'Sort by name' });
    expect(name.getAttribute('aria-disabled')).toBe('true');
    expect(name.getAttribute('title')).toContain('for this transport');
    fireEvent.click(name);
    expect(request).toHaveBeenCalledOnce();
    expect(nextRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(
        result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled'),
      ).toBe('false'),
    );
    expect(nextRequest).toHaveBeenCalledOnce();
  });

  it('keeps sortable reflected headers when a valid query returns no rows', async () => {
    const { view, result, request } = mountConsole('Tag.where(name = "Missing").limit(2).many()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByText('Empty list');
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await waitFor(() => expect(result.getByRole('status').textContent).toBe(''));
    expect(view.state.doc.toString()).toBe(
      'Tag.where(name = "Missing").orderBy(name).limit(2).many()',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
});
