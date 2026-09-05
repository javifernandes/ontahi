import {
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
} from '@ontahi/core/runtime/protocol';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from '../diagnostics.js';
import { instrumentRuntimeTransport } from '../instrument-runtime-transport.js';

import { OntahiDevtools } from './ontahi-devtools.js';

describe('OntahiDevtools', () => {
  it('leads with application intent and separates visual, body, and envelope detail', async () => {
    const diagnostics = createOntahiDiagnostics({
      capturePayloads: true,
      redact: value => value,
    });
    const runtimeRequest = createRuntimeProtocolRequest({
      id: 'read-1',
      family: 'graph.read',
      body: {
        version: 1,
        kind: 'graph-read',
        mode: 'run',
        selection: {
          kind: 'selection',
          entityName: 'TodoItem',
          expression: { kind: 'all' },
        },
        view: {
          version: 1,
          kind: 'entity-view',
          name: 'TodoItemListItem',
          entity: 'TodoItem',
          fields: {
            id: { kind: 'field-view', field: 'id' },
            title: { kind: 'field-view', field: 'title' },
            tags: {
              kind: 'relation-view',
              relation: 'TodoItem.tags',
              view: {
                kind: 'view-node',
                entity: 'Tag',
                fields: { name: { kind: 'field-view', field: 'name' } },
              },
            },
          },
        },
        orderBy: [{ fieldName: 'title', direction: 'asc' }],
      },
    });
    const transport = instrumentRuntimeTransport({
      diagnostics,
      id: 'http',
      kind: 'fetch',
      transport: {
        request: vi.fn().mockResolvedValue(
          createRuntimeProtocolResponse(runtimeRequest, {
            kind: 'graph-read-result',
            value: [{ id: 'todo-1', title: 'Try Devtools', tags: ['Work'] }],
          }),
        ),
      },
    });
    await transport.request(runtimeRequest);
    render(<OntahiDevtools diagnostics={diagnostics} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Ontahí Devtools' }));
    expect(screen.getByRole('complementary', { name: 'Ontahí Devtools' })).toBeTruthy();
    expect(
      screen.getAllByText('TodoItem.all · orderBy title asc · as TodoItemListItem'),
    ).toHaveLength(3);
    expect(screen.getAllByText('graph.read')).toHaveLength(2);
    expect(screen.getByText('success')).toBeTruthy();
    expect(screen.getByText('tags.name')).toBeTruthy();
    expect(screen.getByText('Try Devtools')).toBeTruthy();

    const requestDetail = screen.getByRole('region', { name: 'Request detail' });
    fireEvent.click(within(requestDetail).getByRole('button', { name: 'Body JSON' }));
    expect(requestDetail.querySelector('pre')?.textContent).toContain('"kind": "graph-read"');
    fireEvent.click(within(requestDetail).getByRole('button', { name: 'Envelope' }));
    expect(requestDetail.querySelector('pre')?.textContent).toContain(
      '"protocol": "ontahi.runtime"',
    );

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    fireEvent.click(within(requestDetail).getByRole('button', { name: 'Copy Request JSON' }));
    expect(writeText).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter diagnostics' }), {
      target: { value: 'operation' },
    });
    expect(screen.getByText(/Run an Ontahí query/)).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter diagnostics' }), {
      target: { value: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText(/Run an Ontahí query/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close Devtools' }));
    expect(screen.getByRole('button', { name: 'Open Ontahí Devtools' })).toBeTruthy();
  });

  it('presents an Operation as a remote method invocation', async () => {
    const diagnostics = createOntahiDiagnostics({
      capturePayloads: true,
      redact: value => value,
    });
    const runtimeRequest = createRuntimeProtocolRequest({
      id: 'operation-1',
      family: 'operation',
      body: {
        version: 1,
        kind: 'invoke',
        operationId: 'Todo.createItem',
        input: { title: 'Tune Devtools' },
      },
    });
    const transport = instrumentRuntimeTransport({
      diagnostics,
      id: 'websocket',
      kind: 'websocket',
      transport: {
        request: vi.fn().mockResolvedValue(createRuntimeProtocolResponse(runtimeRequest, null)),
      },
    });
    await transport.request(runtimeRequest);

    render(<OntahiDevtools diagnostics={diagnostics} initiallyOpen />);

    expect(
      screen.getByRole('button', { name: 'Todo.createItem() websocket success' }),
    ).toBeTruthy();
    expect(screen.queryByText('Todo.createItem.invoke')).toBeNull();
  });
});
