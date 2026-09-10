import {
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
} from '@ontahi/core/runtime/protocol';
import { authoringDialectPreference } from '@ontahi/language-codemirror';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from '../diagnostics.js';
import { instrumentRuntimeTransport } from '../instrument-runtime-transport.js';

import { OntahiDevtools } from './ontahi-devtools.js';

afterEach(() => {
  cleanup();
  authoringDialectPreference.set(undefined);
});

// Match the mounted Devtools integration budget under parallel CI coverage.
it(
  'reprojects captured Activity reads and filtering without changing envelopes or executing',
  { timeout: 15_000 },
  async () => {
    const diagnostics = createOntahiDiagnostics({ capturePayloads: true, redact: value => value });
    const envelope = createRuntimeProtocolRequest({
      id: 'read-1',
      family: 'graph.read',
      body: {
        version: 1,
        kind: 'graph-read',
        mode: 'run',
        cardinality: 'many',
        selection: {
          kind: 'selection',
          entityName: 'TodoItem',
          expression: { kind: 'predicate', fieldName: 'completed', operator: 'eq', value: false },
        },
        orderBy: [{ fieldName: 'title', direction: 'desc' }],
        limit: 25,
      },
    });
    const request = vi.fn().mockResolvedValue(
      createRuntimeProtocolResponse(envelope, {
        kind: 'graph-read-result',
        value: [{ title: 'Still here' }],
      }),
    );
    const transport = instrumentRuntimeTransport({
      diagnostics,
      id: 'http',
      kind: 'fetch',
      transport: { request },
    });
    await transport.request(envelope);
    const captured = diagnostics.inspect();
    render(<OntahiDevtools initiallyOpen diagnostics={diagnostics} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Preferred dialect' }), {
      target: { value: 'declarative' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Activity/ }));
    const summary =
      'TodoItem where completed = false · order by title descending · limit 25 · many';
    expect(screen.getAllByText(summary)).toHaveLength(3);
    expect(screen.getByText('TodoItem · where completed = false')).toBeTruthy();
    expect(screen.getByText('Still here')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter diagnostics' }), {
      target: { value: 'where completed = false' },
    });
    expect(screen.getByRole('button', { name: `${summary} http success` })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter diagnostics' }), {
      target: { value: '' },
    });
    const detailElement = screen.getByRole('region', { name: 'Request detail' });
    const detail = within(detailElement);
    fireEvent.click(detail.getByRole('button', { name: 'Body JSON' }));
    const json = detailElement.querySelector('pre')?.textContent;
    expect(JSON.parse(json!)).toEqual(envelope.body);
    act(() => authoringDialectPreference.set('ts'));
    expect(
      screen.getAllByText('TodoItem.where(completed eq false) · orderBy title desc · limit 25'),
    ).toHaveLength(2);
    expect(detailElement.querySelector('pre')?.textContent).toBe(json);
    fireEvent.click(detail.getByRole('button', { name: 'Envelope' }));
    expect(JSON.parse(detailElement.querySelector('pre')!.textContent!)).toEqual(
      captured.events[0]!.kind === 'exchange.started' ? captured.events[0].request : undefined,
    );
    expect(diagnostics.inspect()).toBe(captured);
    expect(request).toHaveBeenCalledOnce();
    expect(document.querySelector('.cm-editor')).toBeNull();
  },
);
