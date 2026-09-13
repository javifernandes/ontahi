import {
  entity,
  field,
  graphReadProtocolError,
  query,
  toGraphReadRequest,
} from '@ontahi/core/data-graph';
import type {
  RuntimeTransport,
  RuntimeProtocolGraphObservationBody,
} from '@ontahi/core/runtime/protocol';
import { describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from './diagnostics.js';
import { instrumentRuntimeTransport } from './instrument-runtime-transport.js';
import { buildActivityEntries, activityEntryTitle } from './react/activity-model.js';

const Book = entity('Book', { id: field.id(), title: field.string() });
const request = toGraphReadRequest(query(Book), 'run');
const body: RuntimeProtocolGraphObservationBody = {
  kind: 'graph-read-result',
  value: [{ id: 'b1', title: 'Secret' }],
};

describe('graph observation diagnostics', () => {
  it('is lazy, forwards exact requests/options/snapshots, and groups independent subscriptions', async () => {
    const diagnostics = createOntahiDiagnostics({ capturePayloads: true, redact: value => value });
    const closed = vi.fn();
    const observe = vi.fn(async function* () {
      try {
        yield body;
        yield body;
      } finally {
        closed();
      }
    });
    const transport: RuntimeTransport = instrumentRuntimeTransport({
      diagnostics,
      id: 'ws',
      kind: 'websocket',
      transport: { request: vi.fn(), graph: { observe } },
    });
    const options = { signal: new AbortController().signal };
    const stream = transport.graph!.observe(request, options)[Symbol.asyncIterator]();
    expect(observe).not.toHaveBeenCalled();
    expect(diagnostics.inspect().events).toHaveLength(0);
    expect((await stream.next()).value).toBe(body);
    expect(observe).toHaveBeenCalledWith(request, options);
    expect((await stream.next()).value).toBe(body);
    expect(closed).not.toHaveBeenCalled();
    expect((await stream.next()).done).toBe(true);
    expect(closed).toHaveBeenCalledOnce();
    expect(diagnostics.inspect().events.map(event => event.kind)).toEqual([
      'graph-observation.started',
      'graph-observation.snapshot',
      'graph-observation.snapshot',
      'graph-observation.settled',
    ]);
    expect(diagnostics.inspect().events[3]).toMatchObject({ sequence: 2, outcome: 'completed' });
    const entries = buildActivityEntries(diagnostics.inspect().events);
    expect(entries).toHaveLength(1);
    expect(activityEntryTitle(entries[0]!)).toContain('observe');
    for await (const _ of transport.graph!.observe(request)) {
      break;
    }
    expect(buildActivityEntries(diagnostics.inspect().events)).toHaveLength(2);
    expect(diagnostics.inspect().events.slice(-1)[0]).toMatchObject({ outcome: 'consumer-closed' });
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('retains metadata without capturing payloads and closes aborted consumers', async () => {
    const diagnostics = createOntahiDiagnostics({ capacity: 1 });
    const closed = vi.fn();
    const controller = new AbortController();
    const transport: RuntimeTransport = instrumentRuntimeTransport({
      diagnostics,
      id: 'ws',
      kind: 'websocket',
      transport: {
        request: vi.fn(),
        graph: {
          observe: async function* () {
            try {
              yield body;
            } finally {
              closed();
            }
          },
        },
      },
    });
    for await (const value of transport.graph!.observe(request, { signal: controller.signal })) {
      expect(value).toBe(body);
      expect(diagnostics.inspect().events[0]).toMatchObject({ rowCount: 1, sequence: 1 });
      expect(diagnostics.inspect().events[0]).not.toHaveProperty('snapshot');
      expect(diagnostics.inspect().events[0]).not.toHaveProperty('request');
      controller.abort();
      break;
    }
    expect(closed).toHaveBeenCalledOnce();
    expect(diagnostics.inspect().events[0]).toMatchObject({ outcome: 'aborted', sequence: 1 });
    expect(buildActivityEntries(diagnostics.inspect().events)).toHaveLength(1);
  });

  it('preserves thrown errors and protocol errors while redacting before delivery', async () => {
    const error = new Error('Secret');
    const diagnostics = createOntahiDiagnostics({
      capturePayloads: true,
      redact: value => JSON.parse(JSON.stringify(value).replaceAll('Secret', 'REDACTED')),
    });
    const delivered: unknown[] = [];
    diagnostics.subscribe(() => {
      delivered.push(diagnostics.inspect());
      throw new Error('subscriber');
    });
    const transport: RuntimeTransport = instrumentRuntimeTransport({
      diagnostics,
      id: 'ws',
      kind: 'websocket',
      transport: {
        request: vi.fn(),
        graph: {
          observe: async function* () {
            yield body;
            throw error;
          },
        },
      },
    });
    const stream = transport.graph!.observe(request)[Symbol.asyncIterator]();
    expect((await stream.next()).value).toBe(body);
    await expect(stream.next()).rejects.toBe(error);
    expect(diagnostics.inspect().events.slice(-1)[0]).toMatchObject({
      outcome: 'transport-error',
      error: { message: 'REDACTED' },
    });
    expect(JSON.stringify(delivered)).not.toContain('Secret');
    const protocolError = graphReadProtocolError('invalid_request', 'Bad query');
    const other: RuntimeTransport = instrumentRuntimeTransport({
      diagnostics,
      id: 'ws',
      kind: 'websocket',
      transport: {
        request: vi.fn(),
        graph: {
          observe: async function* () {
            yield protocolError;
          },
        },
      },
    });
    for await (const value of other.graph!.observe(request)) expect(value).toBe(protocolError);
    expect(diagnostics.inspect().events.slice(-1)[0]).toMatchObject({ outcome: 'protocol-error' });
  });
});
