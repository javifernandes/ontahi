import { entity, field, query, toGraphReadRequest } from '@ontahi/core/data-graph';
import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from '../diagnostics.js';
import { instrumentRuntimeTransport } from '../instrument-runtime-transport.js';

import { OntahiDevtools } from './ontahi-devtools.js';

const Book = entity('Book', { id: field.id(), title: field.string() });
const request = toGraphReadRequest(query(Book), 'run');
afterEach(cleanup);

describe('query observation Activity', { timeout: 15_000 }, () => {
  it('groups a live stream, inspects earlier snapshots while updates arrive, and reports retention loss', async () => {
    const diagnostics = createOntahiDiagnostics({
      capacity: 3,
      capturePayloads: true,
      redact: value => value,
    });
    const transport: RuntimeTransport = instrumentRuntimeTransport({
      diagnostics,
      id: 'ws',
      kind: 'websocket',
      transport: {
        request: vi.fn(),
        graph: {
          observe: async function* () {
            for (const title of ['First', 'Second', 'Third', 'Fourth'])
              yield { kind: 'graph-read-result' as const, value: [{ id: 'b1', title }] };
          },
        },
      },
    });
    render(<OntahiDevtools diagnostics={diagnostics} initiallyOpen />);
    const iterator = transport.graph!.observe(request)[Symbol.asyncIterator]();
    await act(async () => {
      await iterator.next();
    });
    expect(screen.getByText('First')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Observed snapshot' }), {
      target: { value: '1' },
    });
    await act(async () => {
      await iterator.next();
    });
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.queryByText('Second')).toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'Runtime traffic' })).getAllByRole('button'),
    ).toHaveLength(1);
    await act(async () => {
      await iterator.next();
      await iterator.next();
    });
    expect(screen.getByText(/selected snapshot is no longer retained/)).toBeTruthy();
    expect(screen.getByText('Fourth')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByText('"Fourth"')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }));
    expect(screen.getByText(/start event is no longer retained/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Observed snapshot' }), {
      target: { value: 'live' },
    });
    await act(async () => {
      await iterator.next();
    });
    expect(screen.getByText(/completed · ws · 4 updates/)).toBeTruthy();
  });

  it('shows query stream metadata when payload capture is disabled', async () => {
    const diagnostics = createOntahiDiagnostics();
    const transport: RuntimeTransport = instrumentRuntimeTransport({
      diagnostics,
      id: 'ws',
      kind: 'websocket',
      transport: {
        request: vi.fn(),
        graph: {
          observe: async function* () {
            yield { kind: 'graph-read-result' as const, value: [{ secret: 'hidden' }] };
          },
        },
      },
    });
    render(<OntahiDevtools diagnostics={diagnostics} initiallyOpen />);
    await act(async () => {
      for await (const _ of transport.graph!.observe(request)) {
        /* Consume stream. */
      }
    });
    expect(screen.getByText('Snapshot payload was not captured.')).toBeTruthy();
    expect(screen.getByText('Request payload was not captured.')).toBeTruthy();
    expect(screen.queryByText(/hidden/)).toBeNull();
    expect(screen.getByText('Snapshot #1 · 1 rows')).toBeTruthy();
  });
});
