import { EditorView } from '@codemirror/view';
import type { JsonValue } from '@ontahi/core';
import {
  withContextualSelections,
  createEntityRef,
  createGraphClientCache,
  entity,
  field,
} from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolResponse,
  type RuntimeProtocolGraphObservationBody,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from '../diagnostics.js';
import { createEntityHistory } from '../entity-history.js';
import { instrumentRuntimeTransport } from '../instrument-runtime-transport.js';

import { ConsolePanel } from './console-panel.js';
import { OntahiDevtools } from './ontahi-devtools.js';

const Book = entity('Book', { id: field.id(), title: field.string() })
  .locators({ byId: 'id' })
  .identity('byId');
const rows = (title: string): RuntimeProtocolGraphObservationBody => ({
  kind: 'graph-read-result',
  value: [{ id: 'b1', title }],
});
const setupTransport = () => {
  let pending: ((value: IteratorResult<RuntimeProtocolGraphObservationBody>) => void) | undefined;
  let signal: AbortSignal | undefined;
  const close = vi.fn(async () => ({ done: true as const, value: undefined }));
  const observe = vi.fn((_request, options) => {
    signal = options?.signal;
    return {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise<IteratorResult<RuntimeProtocolGraphObservationBody>>(resolve => {
            pending = resolve;
          }),
        return: close,
      }),
    };
  });
  const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) =>
    createRuntimeProtocolResponse<string, JsonValue>(
      envelope,
      (envelope.body as { kind?: string }).kind === 'graph-read-capabilities'
        ? {
            kind: 'graph-read-capabilities-result',
            entityName: 'Book',
            capabilities: { orderBy: ['title'] },
          }
        : {
            kind: 'graph-read-result',
            value: [{ id: 'b1', title: 'Run result' }],
            capabilities: { orderBy: ['title'] },
          },
    ),
  );
  const transport: RuntimeTransport = { request, graph: { observe } };
  return {
    transport,
    request,
    observe,
    close,
    signal: () => signal,
    send: async (body: RuntimeProtocolGraphObservationBody) => {
      await waitFor(() => expect(pending).toBeTypeOf('function'));
      await act(async () => {
        const resolve = pending!;
        pending = undefined;
        resolve({ done: false, value: body });
      });
    },
    finish: async () => {
      await act(async () => {
        pending?.({ done: true, value: undefined });
        pending = undefined;
      });
    },
  };
};
const editor = () =>
  EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Ontahí Console expression' }))!;
afterEach(cleanup);

describe('Console query observation', { timeout: 15_000 }, () => {
  it.each(['ts', 'declarative'] as const)(
    'observes %s queries, reconciles cache/history and keeps drafts separate',
    async initialDialect => {
      const source = setupTransport();
      const diagnostics = createOntahiDiagnostics({
        capturePayloads: true,
        redact: value => value,
      });
      const runtimeTransport = instrumentRuntimeTransport({
        diagnostics,
        transport: source.transport,
        id: 'ws',
        kind: 'websocket',
      });
      const cache = createGraphClientCache();
      const history = createEntityHistory(cache);
      history.setRecording(true);
      render(
        <OntahiDevtools
          initiallyOpen
          clientCache={cache}
          diagnostics={diagnostics}
          runtimeTransport={runtimeTransport}
          console={{
            entities: [Book],
            initialDialect,
            initialDocument: initialDialect === 'ts' ? 'Book.many()' : 'Book many',
          }}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Console' }));
      fireEvent.click(screen.getByRole('button', { name: 'Observe' }));
      await source.send(rows('First'));
      expect(cache.readEntity(createEntityRef(Book, { id: 'b1' }))).toEqual({
        id: 'b1',
        title: 'First',
      });
      // Session observation frames contain rows only; capabilities belong to discovery/Run.
      expect(source.observe.mock.calls[0]?.[0]).not.toHaveProperty('includeCapabilities');
      expect(source.observe.mock.calls[0]?.[0]).toMatchObject({
        mode: 'run',
        version: 1,
      });
      expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      const view = editor();
      act(() =>
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: initialDialect === 'ts' ? 'Book.limit(1).many()' : 'Book limit 1 many',
          },
        }),
      );
      await source.send(rows('Second'));
      expect(source.observe).toHaveBeenCalledOnce();
      expect(screen.getByText('Changes not run')).toBeTruthy();
      expect(screen.getByText('Second')).toBeTruthy();
      expect(history.inspect().entries).toHaveLength(2);
      fireEvent.click(screen.getByRole('button', { name: /Activity/ }));
      expect(screen.getByRole('region', { name: 'Query observation detail' })).toBeTruthy();
      await source.send(rows('Third'));
      expect(history.inspect().entries).toHaveLength(3);
      fireEvent.click(screen.getByRole('button', { name: 'Console' }));
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(source.signal()?.aborted).toBe(true);
      await source.send(rows('Late'));
      expect(cache.readEntity(createEntityRef(Book, { id: 'b1' }))).toEqual({
        id: 'b1',
        title: 'Third',
      });
      expect(screen.queryByText('Late')).toBeNull();
      await waitFor(() => expect(source.close).toHaveBeenCalled());
      expect(diagnostics.inspect().events.slice(-1)[0]).toMatchObject({
        kind: 'graph-observation.settled',
        outcome: 'aborted',
      });
      history.dispose();
    },
  );

  it.each(['ts', 'declarative'] as const)(
    'can Run after stopping a %s observation and observe again',
    async initialDialect => {
      const source = setupTransport();
      render(
        <ConsolePanel
          options={{
            entities: [Book],
            initialDialect,
            initialDocument: initialDialect === 'ts' ? 'Book.many()' : 'Book many',
          }}
          runtimeTransport={source.transport}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Observe' }));
      await source.send(rows('Before Stop'));
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      await source.finish();
      await waitFor(() => expect(source.close).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      expect(await screen.findByText('Run result')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Observe' }));
      await source.send(rows('Observe after Run'));
      expect(source.observe).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Observe after Run')).toBeTruthy();
      await source.finish();
      expect(source.signal()?.aborted).toBe(true);
    },
  );

  it.each(['Book.count()', 'Book.first()', 'Book.exists()', 'Book.one()', 'Book.where('])(
    'disables Observe for %s',
    initialDocument => {
      const source = setupTransport();
      render(
        <ConsolePanel
          options={{ entities: [Book], initialDocument }}
          runtimeTransport={source.transport}
        />,
      );
      expect((screen.getByRole('button', { name: 'Observe' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(source.observe).not.toHaveBeenCalled();
    },
  );

  it('does not downgrade contextual v2 selections to an observation', () => {
    const Chapter = entity('Chapter', { id: field.id(), bookId: field.string() });
    const Library = withContextualSelections(
      entity('Book', { id: field.id() }).hasMany('chapters', Chapter, { via: 'bookId' }),
      ({ self }) => ({ contents: self.chapters }),
    );
    const source = setupTransport();
    render(
      <ConsolePanel
        options={{ entities: [Library, Chapter], initialDocument: 'Book.contents.many()' }}
        runtimeTransport={source.transport}
      />,
    );
    expect(screen.getByRole('button', { name: 'Observe' }).getAttribute('title')).toContain('v2');
    expect((screen.getByRole('button', { name: 'Observe' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(source.observe).not.toHaveBeenCalled();
  });

  it('stops while waiting for the first snapshot without writing a late result', async () => {
    const source = setupTransport();
    const cache = createGraphClientCache();
    render(
      <ConsolePanel
        options={{ entities: [Book] }}
        clientCache={cache}
        runtimeTransport={source.transport}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Observe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await source.send(rows('Late initial'));
    expect(cache.inspect().records).toHaveLength(0);
    expect(screen.queryByText('Late initial')).toBeNull();
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports transport setup failures and permits retry', async () => {
    const source = setupTransport();
    source.observe.mockImplementationOnce(() => {
      throw new Error('Connection lost');
    });
    render(<ConsolePanel options={{ entities: [Book] }} runtimeTransport={source.transport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Observe' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Connection lost');
    fireEvent.click(screen.getByRole('button', { name: 'Observe' }));
    await source.send(rows('Recovered'));
    expect(screen.getByText('Recovered')).toBeTruthy();
    await source.finish();
  });

  it('explains missing transport support and preserves Run', async () => {
    const source = setupTransport();
    render(
      <ConsolePanel
        options={{ entities: [Book] }}
        runtimeTransport={{ request: source.request }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Observe' }).getAttribute('title')).toContain(
      'does not support',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Run result')).toBeTruthy();
  });

  it.each(['identity', 'transport', 'cache', 'unmount'] as const)(
    'cancels on %s replacement and ignores late snapshots',
    async change => {
      const source = setupTransport();
      const cache = createGraphClientCache();
      const options = { entities: [Book] };
      const { rerender, unmount } = render(
        <ConsolePanel options={options} clientCache={cache} runtimeTransport={source.transport} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Observe' }));
      await source.send(rows('Before'));
      if (change === 'unmount') unmount();
      else
        rerender(
          <ConsolePanel
            options={
              change === 'identity'
                ? { ...options, identity: { principal: { kind: 'user', subject: 'other' } } }
                : options
            }
            clientCache={change === 'cache' ? createGraphClientCache() : cache}
            runtimeTransport={
              change === 'transport' ? setupTransport().transport : source.transport
            }
          />,
        );
      expect(source.signal()?.aborted).toBe(true);
      await source.send(rows('Late'));
      expect(cache.readEntity(createEntityRef(Book, { id: 'b1' }))).toEqual({
        id: 'b1',
        title: 'Before',
      });
      expect(screen.queryByText('Late')).toBeNull();
      if (change === 'identity') expect(screen.queryByText('Before')).toBeNull();
    },
  );

  it('handles empty snapshots, server rejection, natural completion and restart', async () => {
    const source = setupTransport();
    render(<ConsolePanel options={{ entities: [Book] }} runtimeTransport={source.transport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Observe' }));
    await source.send(rows('Before'));
    await source.send({ kind: 'graph-read-result', value: [] });
    expect(screen.queryByText('Before')).toBeNull();
    await source.finish();
    expect(screen.getByText(/Observation completed · 2 updates/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Observe' }));
    await source.send({
      kind: 'protocol-error',
      error: { code: 'access_denied', message: 'Read denied' },
    });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Read denied');
    expect((screen.getByRole('button', { name: 'Observe' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
