import { entity, field } from '@ontahi/core/data-graph';
import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  createRuntimeTransportRouter,
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
  type RuntimeProtocolRequestEnvelope,
} from '@ontahi/core/runtime/protocol';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from '../diagnostics.js';
import { instrumentRuntimeTransport } from '../instrument-runtime-transport.js';

import { OntahiDevtools } from './ontahi-devtools.js';

const uiTestTimeoutMs = 15_000;
const originalRangeGetClientRects = Range.prototype.getClientRects;

beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [] as unknown as DOMRectList,
  });
});

afterAll(() => {
  if (originalRangeGetClientRects) {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: originalRangeGetClientRects,
    });
  } else {
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
  }
});

describe('OntahiDevtools', () => {
  it(
    'leads with application intent and separates visual, body, and envelope detail',
    async () => {
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

      const launcher = screen.getByRole('button', { name: 'Open Ontahí Devtools' });
      expect(launcher.querySelector('svg')).toBeTruthy();
      expect(launcher.textContent).toBe('');
      fireEvent.click(launcher);
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
      expect(screen.queryByRole('region', { name: 'Selected diagnostic detail' })).toBeNull();
      fireEvent.change(screen.getByRole('searchbox', { name: 'Filter diagnostics' }), {
        target: { value: '' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(screen.getByText(/Run an Ontahí query/)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Close Devtools' }));
      expect(screen.getByRole('button', { name: 'Open Ontahí Devtools' })).toBeTruthy();
    },
    uiTestTimeoutMs,
  );

  it(
    'docks to the viewport and allows its height to be resized',
    () => {
      const diagnostics = createOntahiDiagnostics();
      render(<OntahiDevtools diagnostics={diagnostics} initiallyOpen />);

      const panel = screen.getByRole('complementary', { name: 'Ontahí Devtools' });
      expect(panel.style.left).toBe('0px');
      expect(panel.style.right).toBe('0px');
      expect(panel.style.bottom).toBe('0px');
      expect(panel.style.width).toBe('100%');
      expect(panel.style.height).toBe('360px');

      const resizer = screen.getByRole('separator', { name: 'Resize Devtools' });
      expect(resizer.getAttribute('aria-valuenow')).toBe('360');
      fireEvent.keyDown(resizer, { key: 'ArrowUp' });
      expect(panel.style.height).toBe('392px');
      expect(resizer.getAttribute('aria-valuenow')).toBe('392');
      fireEvent.keyDown(resizer, { key: 'ArrowDown' });
      expect(panel.style.height).toBe('360px');

      fireEvent.pointerDown(resizer, { button: 0, pointerId: 1, clientY: 360 });
      fireEvent.pointerMove(resizer, { pointerId: 1, clientY: 320 });
      expect(panel.style.height).toBe('400px');
      fireEvent.pointerUp(resizer, { pointerId: 1, clientY: 320 });
      fireEvent.click(screen.getByRole('button', { name: 'Close Devtools' }));
    },
    uiTestTimeoutMs,
  );

  it(
    'owns a generic Settings view for configurable Runtime transports',
    () => {
      const diagnostics = createOntahiDiagnostics();
      const runtimeTransport = createRuntimeTransportRouter({
        transports: {
          http: { request: vi.fn() },
          websocket: { request: vi.fn() },
        },
        routing: { 'graph.read': 'http' },
      });
      render(
        <OntahiDevtools
          diagnostics={diagnostics}
          initiallyOpen
          runtimeTransport={runtimeTransport}
        />,
      );

      expect(screen.getByRole('region', { name: 'Runtime traffic' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      expect(screen.getByRole('region', { name: 'Devtools settings' })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Transport for graph reads' })).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Runtime traffic' })).toBeNull();

      fireEvent.change(screen.getByRole('combobox', { name: 'Transport for graph reads' }), {
        target: { value: 'websocket' },
      });
      expect(runtimeTransport.routing.inspect().assignments['graph.read']).toBe('websocket');

      fireEvent.click(screen.getByRole('button', { name: /Activity/ }));
      expect(screen.getByRole('region', { name: 'Runtime traffic' })).toBeTruthy();
    },
    uiTestTimeoutMs,
  );

  it(
    'executes a keyword-free Selection expression from the Console through Runtime Transport',
    async () => {
      const diagnostics = createOntahiDiagnostics({
        capturePayloads: true,
        redact: value => value,
      });
      const TodoItem = entity('TodoItem', {
        id: field.id(),
        title: field.string(),
        completed: field.boolean(),
      });
      const request = vi.fn().mockImplementation(async (envelope: RuntimeProtocolRequestEnvelope) =>
        createRuntimeProtocolResponse(envelope, {
          kind: 'graph-read-result',
          value: [{ id: 'todo-1', title: 'Try semantic Console', completed: false }],
        }),
      );
      const runtimeTransport = instrumentRuntimeTransport({
        diagnostics,
        id: 'http',
        kind: 'fetch',
        transport: { request },
      });

      render(
        <OntahiDevtools
          console={{
            entities: [TodoItem],
            initialDocument: 'TodoItem.where(completed = false).limit(2).many()',
          }}
          diagnostics={diagnostics}
          initiallyOpen
          runtimeTransport={runtimeTransport}
        />,
      );

      const panel = within(
        screen.getAllByRole('complementary', { name: 'Ontahí Devtools' }).slice(-1)[0]!,
      );
      fireEvent.click(panel.getByRole('button', { name: 'Console' }));
      expect(panel.getByRole('textbox', { name: 'Ontahí Console expression' })).toBeTruthy();
      const completedValue = panel.getByRole('combobox', {
        name: 'Value for TodoItem.completed',
      }) as HTMLSelectElement;
      expect(completedValue.value).toBe('false');
      expect(panel.getByText('TodoItem · graph.read · limit 2')).toBeTruthy();
      fireEvent.change(completedValue, { target: { value: 'true' } });
      fireEvent.click(panel.getByRole('button', { name: 'Run' }));

      expect(await panel.findByRole('table')).toBeTruthy();
      expect(panel.getByText('Try semantic Console')).toBeTruthy();
      expect(panel.getByRole('button', { name: 'Visual' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      fireEvent.click(panel.getByRole('button', { name: 'JSON' }));
      expect(await panel.findByText('\"Try semantic Console\"')).toBeTruthy();
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0]?.[0]).toMatchObject({
        family: 'graph.read',
        body: {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: {
            kind: 'selection',
            entityName: 'TodoItem',
            expression: {
              kind: 'predicate',
              fieldName: 'completed',
              operator: 'eq',
              value: true,
            },
          },
          orderBy: [],
          limit: 2,
          cardinality: 'many',
        },
      });

      fireEvent.click(panel.getByRole('button', { name: /Activity/ }));
      expect(await panel.findAllByText('graph.read')).not.toHaveLength(0);
      fireEvent.click(panel.getByRole('button', { name: 'Close Devtools' }));
    },
    uiTestTimeoutMs,
  );

  it(
    'executes a Console count and renders its scalar result',
    async () => {
      const diagnostics = createOntahiDiagnostics();
      const Tag = entity('Tag', {
        id: field.id(),
        name: field.string(),
      });
      const request = vi.fn().mockImplementation(async (envelope: RuntimeProtocolRequestEnvelope) =>
        createRuntimeProtocolResponse(envelope, {
          kind: 'graph-read-result',
          value: 3,
        }),
      );
      const runtimeTransport = instrumentRuntimeTransport({
        diagnostics,
        id: 'http',
        kind: 'fetch',
        transport: { request },
      });

      render(
        <OntahiDevtools
          console={{ entities: [Tag], initialDocument: 'Tag.count()' }}
          diagnostics={diagnostics}
          initiallyOpen
          runtimeTransport={runtimeTransport}
        />,
      );

      const panel = within(
        screen.getAllByRole('complementary', { name: 'Ontahí Devtools' }).slice(-1)[0]!,
      );
      fireEvent.click(panel.getByRole('button', { name: 'Console' }));
      expect(panel.getByText('Tag · graph.read · count')).toBeTruthy();
      fireEvent.click(panel.getByRole('button', { name: 'Run' }));

      expect(await within(panel.getByLabelText('Console result')).findByText('3')).toBeTruthy();
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0]?.[0]).toMatchObject({
        family: 'graph.read',
        body: {
          version: 1,
          kind: 'graph-read',
          mode: 'count',
          selection: {
            kind: 'selection',
            entityName: 'Tag',
            expression: { kind: 'all' },
          },
          orderBy: [],
        },
      });
      expect(request.mock.calls[0]?.[0].body).not.toHaveProperty('limit');
      expect(request.mock.calls[0]?.[0].body).not.toHaveProperty('cardinality');
      fireEvent.click(panel.getByRole('button', { name: 'Close Devtools' }));
    },
    uiTestTimeoutMs,
  );

  it(
    'executes an exact-one Console read and renders its single result',
    async () => {
      const diagnostics = createOntahiDiagnostics({
        capturePayloads: true,
        redact: value => value,
      });
      const TodoItem = entity('TodoItem', {
        id: field.id(),
        title: field.string(),
      });
      const request = vi
        .fn()
        .mockImplementationOnce(async (envelope: RuntimeProtocolRequestEnvelope) =>
          createRuntimeProtocolResponse(envelope, {
            kind: 'graph-read-result',
            value: { id: 'todo-1', title: 'One semantic result' },
          }),
        )
        .mockImplementationOnce(async (envelope: RuntimeProtocolRequestEnvelope) =>
          createRuntimeProtocolResponse(envelope, {
            kind: 'protocol-error',
            error: {
              code: 'cardinality_mismatch',
              message:
                'Expected exactly one TodoItem, but the Selection resolved to zero or multiple results.',
            },
          }),
        );
      const runtimeTransport = instrumentRuntimeTransport({
        diagnostics,
        id: 'http',
        kind: 'fetch',
        transport: { request },
      });

      render(
        <OntahiDevtools
          console={{
            entities: [TodoItem],
            initialDocument: 'TodoItem.one()',
          }}
          diagnostics={diagnostics}
          initiallyOpen
          runtimeTransport={runtimeTransport}
        />,
      );

      const panel = within(
        screen.getAllByRole('complementary', { name: 'Ontahí Devtools' }).slice(-1)[0]!,
      );
      fireEvent.click(panel.getByRole('button', { name: 'Console' }));
      fireEvent.click(panel.getByRole('button', { name: 'Run' }));

      expect(await panel.findByText('One semantic result')).toBeTruthy();
      expect(request.mock.calls[0]?.[0]).toMatchObject({
        family: 'graph.read',
        body: {
          mode: 'get',
          cardinality: 'one',
          selection: {
            entityName: 'TodoItem',
            expression: {
              kind: 'all',
            },
          },
        },
      });
      fireEvent.click(panel.getByRole('button', { name: 'JSON' }));
      expect(await panel.findByText('"One semantic result"')).toBeTruthy();
      fireEvent.click(panel.getByRole('button', { name: 'Run' }));
      expect((await panel.findByRole('alert')).textContent).toBe(
        'Expected exactly one TodoItem, but the Selection resolved to zero or multiple results.',
      );
      fireEvent.click(panel.getByRole('button', { name: 'Close Devtools' }));
    },
    uiTestTimeoutMs,
  );

  it(
    'presents an Operation as a remote method invocation',
    async () => {
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
          operationId: 'TodoItem.createItem',
          input: {
            list: {
              kind: 'entity-ref',
              entityName: 'TodoList',
              locator: { id: 'list-later' },
            },
            title: 'nuevo item',
          },
        },
      });
      const transport = instrumentRuntimeTransport({
        diagnostics,
        id: 'websocket',
        kind: 'websocket',
        transport: {
          request: vi.fn().mockResolvedValue(
            createRuntimeProtocolResponse(runtimeRequest, {
              kind: 'invocation-result',
              result: {
                ok: true,
                kind: 'success',
                value: {
                  id: 'todo-new',
                  list: {
                    kind: 'entity-ref',
                    entityName: 'TodoList',
                    locator: { id: 'list-later' },
                  },
                  title: 'nuevo item',
                  completed: false,
                },
              },
            }),
          ),
        },
      });
      await transport.request(runtimeRequest);

      render(<OntahiDevtools diagnostics={diagnostics} initiallyOpen />);

      expect(
        screen.getByRole('button', { name: 'TodoItem.createItem() websocket success' }),
      ).toBeTruthy();
      expect(screen.queryByText('TodoItem.createItem.invoke')).toBeNull();

      const request = within(screen.getByRole('region', { name: 'Request detail' }));
      const response = within(screen.getByRole('region', { name: 'Response detail' }));
      expect(request.getByText('Input')).toBeTruthy();
      expect(request.getByText('list-later')).toBeTruthy();
      expect(request.getByText('nuevo item')).toBeTruthy();
      expect(request.queryByText('entity-ref')).toBeNull();
      expect(request.queryByText('operationId')).toBeNull();
      expect(response.getByText('Returned value')).toBeTruthy();
      expect(response.getByText('todo-new')).toBeTruthy();
      expect(response.queryByText('invocation-result')).toBeNull();
      expect(response.queryByText('ok')).toBeNull();

      fireEvent.click(request.getByRole('button', { name: 'Body JSON' }));
      expect(request.getByRole('button', { name: 'Copy Request JSON' })).toBeTruthy();
      expect(request.getByText(/"operationId"/)).toBeTruthy();
      expect(request.getByText(/"entity-ref"/)).toBeTruthy();
    },
    uiTestTimeoutMs,
  );

  it(
    'correlates Operation progress into the unified Activity detail',
    async () => {
      const diagnostics = createOntahiDiagnostics({
        capturePayloads: true,
        redact: value => value,
        createId: () => 'observation-1',
      });
      const runtimeRequest = createRuntimeProtocolRequest({
        id: 'complete-all-1',
        family: 'operation',
        body: {
          version: 1,
          kind: 'invoke',
          operationId: 'TodoList.completeAll',
          input: { listId: 'list-1' },
        },
      });
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'TodoList.completeAll',
          runId: 'run-1',
          status: 'running',
          updatedAt: '2026-01-01T00:00:00.000Z',
          progress: { phase: 'updating', message: 'Updating todos', percent: 50 },
        },
        {
          taskId: 'TodoList.completeAll',
          runId: 'run-1',
          status: 'completed',
          updatedAt: '2026-01-01T00:00:01.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          progress: { phase: 'updating', percent: 100 },
          result: { completed: 3 },
        },
      ];
      const transport = instrumentRuntimeTransport({
        diagnostics,
        id: 'websocket',
        kind: 'websocket',
        transport: {
          request: vi.fn().mockResolvedValue(
            createRuntimeProtocolResponse(runtimeRequest, {
              kind: 'invocation-result',
              result: {
                ok: true,
                kind: 'success',
                value: {
                  taskId: 'TodoList.completeAll',
                  runId: 'run-1',
                  status: 'queued',
                },
              },
            }),
          ),
          durableOperation: {
            observe: async function* <TResult>(_run: TaskRunIdentity) {
              for (const snapshot of snapshots) yield snapshot as TaskSnapshot<TResult>;
            },
          },
        },
      });

      await transport.request(runtimeRequest);
      for await (const _snapshot of transport.durableOperation.observe({
        taskId: 'TodoList.completeAll',
        runId: 'run-1',
      })) {
        // Consume the progress stream so Devtools receives the complete timeline.
      }
      render(<OntahiDevtools diagnostics={diagnostics} initiallyOpen />);

      expect(screen.queryByRole('button', { name: /Durable/ })).toBeNull();
      expect(
        screen.getByRole('button', { name: 'TodoList.completeAll() websocket completed' }),
      ).toBeTruthy();
      expect(screen.getAllByText('2 updates').length).toBeGreaterThan(0);
      expect(screen.getByText('running · Updating todos')).toBeTruthy();
      expect(screen.getByText('completed · updating')).toBeTruthy();
      expect(screen.getByText(/update #1 .* 50%/)).toBeTruthy();
      expect(screen.getByText('run-1')).toBeTruthy();
      expect(screen.getByRole('list', { name: 'Operation progress messages' })).toBeTruthy();
    },
    uiTestTimeoutMs,
  );
});
