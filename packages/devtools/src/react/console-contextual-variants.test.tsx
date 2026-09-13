import { EditorView } from '@codemirror/view';
import { isJsonValue } from '@ontahi/core';
import {
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  entity,
  field,
  withContextualSelections,
} from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolResponse,
  type RuntimeProtocolRequestEnvelope,
} from '@ontahi/core/runtime/protocol';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Effect } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ConsolePanel } from './console-panel.js';

const originalRange = Range.prototype.getClientRects;
beforeAll(() =>
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] }),
);
afterAll(() => {
  if (originalRange)
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: originalRange,
    });
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
});
afterEach(cleanup);

describe('Console classified contextual navigation', { timeout: 15_000 }, () => {
  it.each(['ts', 'declarative'] as const)(
    'discovers, executes and edits the final classified target in %s',
    async initialDialect => {
      const Base = entity('ContentNode', {
        id: field.id(),
        title: field.string(),
        bookId: field.string(),
        parentId: field.nullable(field.string()),
        type: field.enum(['part', 'chapter']),
      });
      const Chapter = Base.variant('Chapter', { discriminator: { type: 'chapter' } });
      const Node = withContextualSelections(
        Base.hasMany('children', Base, { via: 'parentId' }),
        ({ self }) => ({ chapters: self.children.as(Chapter) }),
      );
      const Part = Node.variant('Part', { discriminator: { type: 'part' } });
      const Book = withContextualSelections(
        entity('Book', { id: field.id() }).hasMany('nodes', Node, { via: 'bookId' }),
        ({ self }) => ({ parts: self.nodes.as(Part) }),
      );
      const runtime = createInMemoryDataGraphRuntime({
        entities: [Book, Node],
        dataset: {
          Book: [{ id: 'b1' }],
          ContentNode: [
            { id: 'p1', title: 'Part heading', bookId: 'b1', parentId: null, type: 'part' },
            { id: 'c1', title: 'Intro', bookId: 'b1', parentId: 'p1', type: 'chapter' },
            { id: 'wrong', title: 'Wrong child', bookId: 'b1', parentId: 'p1', type: 'part' },
          ],
        },
      });
      const execute = vi.fn(query => Effect.runPromise(runtime.run(query, undefined)));
      const dispatch = createGraphReadDispatcher({
        relationSelections: true,
        policies: [
          {
            entity: Book,
            scope: 'all',
            modes: ['run'],
            cardinalities: ['many'],
            maxLimit: 25,
            fields: { id: { select: true } },
            selectionRelations: ['nodes'],
          },
          {
            entity: Node,
            variants: [Part, Chapter],
            scope: 'all',
            modes: ['run'],
            cardinalities: ['many'],
            maxLimit: 25,
            fields: {
              id: { select: true },
              title: { select: true, order: true },
              type: { select: true },
              bookId: { select: true },
              parentId: { select: true },
            },
            selectionRelations: ['children'],
          },
        ],
        execute,
      });
      const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) => {
        const response = await dispatch(envelope.body, { authority: undefined });
        if (!isJsonValue(response)) throw new Error('Nonportable response');
        return createRuntimeProtocolResponse(envelope, response);
      });
      const prefix = initialDialect === 'ts' ? 'Book.parts.' : 'Book through parts through ';
      render(
        <ConsolePanel
          options={{ entities: [Book, Node], initialDocument: prefix, initialDialect }}
          runtimeTransport={{ request }}
        />,
      );
      const view = EditorView.findFromDOM(
        screen.getByRole('textbox', { name: 'Ontahí Console expression' }),
      )!;
      await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
      await act(async () => {
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
        fireEvent.keyDown(view.contentDOM, { key: ' ', code: 'Space', ctrlKey: true });
      });
      const completions = within(await screen.findByRole('listbox'));
      expect(
        completions.getAllByRole('option').some(option => option.textContent?.includes('chapters')),
      ).toBe(true);
      expect(execute).not.toHaveBeenCalled();
      const source =
        initialDialect === 'ts'
          ? 'Book.parts.chapters.many()'
          : 'Book through parts through chapters many';
      act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } }));
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      const result = within(screen.getByLabelText('Console result'));
      await result.findByRole('table');
      expect(result.getByText('Intro')).toBeDefined();
      expect(result.queryByText('Wrong child')).toBeNull();
      expect(result.queryByText('Part heading')).toBeNull();
      fireEvent.click(result.getByRole('button', { name: /Sort by title/ }));
      await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
      expect(view.state.doc.toString()).toContain(
        initialDialect === 'ts'
          ? '.parts.chapters.orderBy(title)'
          : 'through parts through chapters order by title',
      );
      expect(execute.mock.calls[1]![0].root).toBe(Node);
      expect(execute.mock.calls[1]![0].orderBy).toEqual([
        { kind: 'order', fieldName: 'title', direction: 'asc' },
      ]);
    },
  );
});
