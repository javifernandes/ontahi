import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { TaskRunRef, TaskSnapshot } from '../contracts.js';

import {
  createRuntimeProtocolDispatcher,
  createRuntimeProtocolRegistry,
  createRuntimeProtocolRequest,
  durableOperationProtocolError,
  parseDurableOperationProtocolResponse,
  runtimeProtocolFamilies,
  toDurableOperationInteractionResponseRequest,
  toDurableOperationProtocolRequest,
  toDurableOperationSnapshotResponse,
  type DurableOperationProtocolRequestV1,
} from './index.js';

const run = {
  taskId: 'Todo.completeAll',
  runId: 'run-1',
} as const;

describe('Runtime Protocol Durable Operation family', () => {
  it('authors and registers a typed version 1 inspect request', () => {
    const taskRunRef = {
      ...run,
      status: 'queued',
    } satisfies TaskRunRef;
    const body = toDurableOperationProtocolRequest(taskRunRef);
    const request = createRuntimeProtocolRequest({
      id: 'exchange-inspect',
      family: 'durable.operation',
      body,
    });
    const registry = createRuntimeProtocolRegistry(runtimeProtocolFamilies);
    const parsed = registry.parseRequest(JSON.parse(JSON.stringify(request)));

    expect(body).toEqual({
      version: 1,
      kind: 'inspect',
      run,
    });
    expect(parsed).toEqual({ success: true, request });
    if (parsed.success && parsed.request.family === 'durable.operation') {
      expectTypeOf(parsed.request.body).toEqualTypeOf<DurableOperationProtocolRequestV1>();
    }
  });

  it('authors and registers a typed interaction response request', () => {
    const body = toDurableOperationInteractionResponseRequest(run, {
      interactionId: 'choose-list',
      optionId: 'list-inbox',
    });
    const request = createRuntimeProtocolRequest({
      id: 'exchange-respond',
      family: 'durable.operation',
      body,
    });
    const registry = createRuntimeProtocolRegistry(runtimeProtocolFamilies);

    expect(registry.parseRequest(JSON.parse(JSON.stringify(request)))).toEqual({
      success: true,
      request,
    });
  });

  it('authors and registers a typed approval response request', () => {
    const body = toDurableOperationInteractionResponseRequest(run, {
      interactionId: 'approve-delete',
      decision: 'reject',
      reason: 'Keep these items.',
    });
    const request = createRuntimeProtocolRequest({
      id: 'exchange-approve',
      family: 'durable.operation',
      body,
    });
    const registry = createRuntimeProtocolRegistry(runtimeProtocolFamilies);

    expect(registry.parseRequest(JSON.parse(JSON.stringify(request)))).toEqual({
      success: true,
      request,
    });
  });

  it('authors and registers a typed input response request', () => {
    const body = toDurableOperationInteractionResponseRequest(run, {
      interactionId: 'TodoItem.addItem:title',
      value: 'Buy milk',
    });
    const request = createRuntimeProtocolRequest({
      id: 'exchange-input',
      family: 'durable.operation',
      body,
    });
    expect(createRuntimeProtocolRegistry(runtimeProtocolFamilies).parseRequest(request)).toEqual({
      success: true,
      request,
    });
  });

  it.each([2.5, false, null])('authors a portable %j input response', value => {
    const body = toDurableOperationInteractionResponseRequest(run, {
      interactionId: 'typed-input',
      value,
    });
    expect(createRuntimeProtocolRegistry(runtimeProtocolFamilies).parseRequest(body)).toMatchObject(
      {
        success: false,
      },
    );
    expect(
      createRuntimeProtocolRegistry(runtimeProtocolFamilies).parseRequest(
        createRuntimeProtocolRequest({ id: 'typed-response', family: 'durable.operation', body }),
      ),
    ).toEqual({
      success: true,
      request: createRuntimeProtocolRequest({
        id: 'typed-response',
        family: 'durable.operation',
        body,
      }),
    });
  });

  it.each([
    { name: 'non-object body', body: null, code: 'invalid_request' },
    {
      name: 'unsupported version',
      body: { version: 2, kind: 'inspect', run },
      code: 'unsupported_version',
    },
    {
      name: 'cancellation absent from the runtime contract',
      body: { version: 1, kind: 'cancel', run },
      code: 'invalid_request',
    },
    {
      name: 'missing interaction response',
      body: { version: 1, kind: 'respond', run },
      code: 'invalid_request',
    },
    {
      name: 'empty interaction response identity',
      body: {
        version: 1,
        kind: 'respond',
        run,
        response: { interactionId: '', optionId: 'list-inbox' },
      },
      code: 'invalid_request',
    },
    {
      name: 'unknown approval decision',
      body: {
        version: 1,
        kind: 'respond',
        run,
        response: { interactionId: 'approve-delete', decision: 'maybe' },
      },
      code: 'invalid_request',
    },
    {
      name: 'ambiguous interaction response',
      body: {
        version: 1,
        kind: 'respond',
        run,
        response: {
          interactionId: 'approve-delete',
          optionId: 'yes',
          decision: 'approve',
        },
      },
      code: 'invalid_request',
    },
    {
      name: 'unknown strict request key',
      body: { version: 1, kind: 'inspect', run, authority: 'user-1' },
      code: 'invalid_request',
    },
    {
      name: 'non-object run identity',
      body: { version: 1, kind: 'inspect', run: 'run-1' },
      code: 'invalid_request',
    },
    {
      name: 'empty task identity',
      body: { version: 1, kind: 'inspect', run: { ...run, taskId: '' } },
      code: 'invalid_request',
    },
    {
      name: 'empty run identity',
      body: { version: 1, kind: 'inspect', run: { ...run, runId: '' } },
      code: 'invalid_request',
    },
    {
      name: 'run metadata outside portable identity',
      body: { version: 1, kind: 'inspect', run: { ...run, status: 'running' } },
      code: 'invalid_request',
    },
  ])('fails closed for an $name', ({ body, code }) => {
    const registry = createRuntimeProtocolRegistry(runtimeProtocolFamilies);
    const result = registry.parseRequest(
      createRuntimeProtocolRequest({
        id: 'exchange-invalid',
        family: 'durable.operation',
        body,
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: {
        id: 'exchange-invalid',
        family: 'durable.operation',
        error: {
          code: 'invalid_family_request',
          details: { familyError: { error: { code } } },
        },
      },
    });
  });

  it('normalizes storage snapshots with undefined properties into portable snapshot bodies', () => {
    const storageSnapshot: TaskSnapshot = {
      ...run,
      status: 'running',
      subject: undefined,
      createdAt: '2026-08-30T23:50:00.000Z',
      startedAt: undefined,
      updatedAt: '2026-08-30T23:50:01.000Z',
      completedAt: undefined,
      progress: {
        phase: 'updating',
        message: undefined,
        percent: 50,
      },
      interaction: {
        id: 'choose-list',
        kind: 'choice',
        prompt: 'Which list?',
        options: [
          { id: 'list-inbox', label: 'Inbox' },
          { id: 'list-later', label: 'Later' },
        ],
        createdAt: '2026-08-30T23:50:01.000Z',
      },
      error: undefined,
      result: undefined,
    };

    const response = toDurableOperationSnapshotResponse(storageSnapshot);

    expect(response).toEqual({
      version: 1,
      kind: 'snapshot',
      snapshot: {
        ...run,
        status: 'running',
        createdAt: '2026-08-30T23:50:00.000Z',
        updatedAt: '2026-08-30T23:50:01.000Z',
        progress: { phase: 'updating', percent: 50 },
        interaction: {
          id: 'choose-list',
          kind: 'choice',
          prompt: 'Which list?',
          options: [
            { id: 'list-inbox', label: 'Inbox' },
            { id: 'list-later', label: 'Later' },
          ],
          createdAt: '2026-08-30T23:50:01.000Z',
        },
      },
    });
    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
    expect(parseDurableOperationProtocolResponse(response)).toEqual({
      success: true,
      response,
    });
  });

  it('transports an exact approval proposal without response values', () => {
    const response = toDurableOperationSnapshotResponse({
      ...run,
      status: 'running',
      updatedAt: '2026-08-30T23:50:01.000Z',
      interaction: {
        id: 'approve-delete',
        kind: 'approval',
        prompt: 'Delete these items?',
        proposal: {
          id: 'delete-items-v1',
          summary: 'Delete two items from Shopping.',
          requests: [
            {
              version: 1,
              kind: 'graph-command',
              command: { action: 'delete', entityName: 'TodoItem', id: 'todo-1' },
            },
          ],
        },
        createdAt: '2026-08-30T23:50:01.000Z',
      },
    });

    expect(parseDurableOperationProtocolResponse(JSON.parse(JSON.stringify(response)))).toEqual({
      success: true,
      response,
    });
  });

  it.each([
    { type: 'string' as const },
    { type: 'number' as const, nullable: true as const },
    { type: 'boolean' as const },
    { type: 'enum' as const, values: ['low', 'high', null], nullable: true as const },
  ])('transports a pending $type input without its eventual value', input => {
    const response = toDurableOperationSnapshotResponse({
      ...run,
      status: 'running',
      updatedAt: '2026-10-04T00:00:00.000Z',
      interaction: {
        id: 'TodoItem.addItem:title',
        kind: 'input',
        prompt: 'What should the item say?',
        input,
        createdAt: '2026-10-04T00:00:00.000Z',
      },
    });
    expect(parseDurableOperationProtocolResponse(JSON.parse(JSON.stringify(response)))).toEqual({
      success: true,
      response,
    });
  });

  it('preserves complete result, failure, subject, progress, and lifecycle timestamps', () => {
    const completed = toDurableOperationSnapshotResponse({
      ...run,
      status: 'completed',
      subject: { type: 'todo-list', id: 'list-1' },
      createdAt: '2026-08-30T23:50:00.000Z',
      startedAt: '2026-08-30T23:50:01.000Z',
      updatedAt: '2026-08-30T23:50:02.000Z',
      completedAt: '2026-08-30T23:50:02.000Z',
      progress: { phase: 'updating', message: 'Done', percent: 100 },
      result: { completed: 3, ids: ['todo-1', 'todo-2', 'todo-3'] },
    });
    const failed = toDurableOperationSnapshotResponse({
      ...run,
      status: 'failed',
      updatedAt: '2026-08-30T23:50:02.000Z',
      completedAt: '2026-08-30T23:50:02.000Z',
      error: { code: 'todo_update_failed', message: 'Could not update every Todo.' },
    });

    expect(completed.snapshot).toEqual({
      ...run,
      status: 'completed',
      subject: { type: 'todo-list', id: 'list-1' },
      createdAt: '2026-08-30T23:50:00.000Z',
      startedAt: '2026-08-30T23:50:01.000Z',
      updatedAt: '2026-08-30T23:50:02.000Z',
      completedAt: '2026-08-30T23:50:02.000Z',
      progress: { phase: 'updating', message: 'Done', percent: 100 },
      result: { completed: 3, ids: ['todo-1', 'todo-2', 'todo-3'] },
    });
    expect(failed.snapshot).toEqual({
      ...run,
      status: 'failed',
      updatedAt: '2026-08-30T23:50:02.000Z',
      completedAt: '2026-08-30T23:50:02.000Z',
      error: { code: 'todo_update_failed', message: 'Could not update every Todo.' },
    });
  });

  it.each(['queued', 'running', 'completed', 'failed', 'cancelled'] as const)(
    'preserves the %s Task status',
    status => {
      expect(
        toDurableOperationSnapshotResponse({
          ...run,
          status,
          updatedAt: '2026-08-30T23:50:00.000Z',
        }).snapshot.status,
      ).toBe(status);
    },
  );

  it.each([
    { name: 'non-object response', response: null },
    {
      name: 'unsupported snapshot version',
      response: {
        version: 2,
        kind: 'snapshot',
        snapshot: { ...run, status: 'running', updatedAt: 'now' },
      },
    },
    {
      name: 'unknown response key',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: { ...run, status: 'running', updatedAt: 'now' },
        cursor: 'next',
      },
    },
    {
      name: 'unknown snapshot key',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: { ...run, status: 'running', updatedAt: 'now', runtimeSecret: 'private' },
      },
    },
    {
      name: 'unknown status',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: { ...run, status: 'paused', updatedAt: 'now' },
      },
    },
    {
      name: 'empty snapshot identity',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: { ...run, runId: '', status: 'running', updatedAt: 'now' },
      },
    },
    {
      name: 'missing updated timestamp',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: { ...run, status: 'running' },
      },
    },
    {
      name: 'invalid timestamp',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: { ...run, status: 'running', updatedAt: 1 },
      },
    },
    {
      name: 'empty timestamp',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: { ...run, status: 'running', updatedAt: '' },
      },
    },
    {
      name: 'unknown progress key',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'running',
          updatedAt: 'now',
          progress: { phase: 'updating', privateState: true },
        },
      },
    },
    {
      name: 'invalid subject',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'running',
          updatedAt: 'now',
          subject: { type: 'todo-list' },
        },
      },
    },
    {
      name: 'non-finite progress',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'running',
          updatedAt: 'now',
          progress: { percent: Number.POSITIVE_INFINITY },
        },
      },
    },
    {
      name: 'invalid error',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'failed',
          updatedAt: 'now',
          error: { code: 500, message: 'Failed.' },
        },
      },
    },
    {
      name: 'interaction option value leakage',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'running',
          updatedAt: 'now',
          interaction: {
            id: 'choose-list',
            kind: 'choice',
            prompt: 'Which list?',
            options: [{ id: 'inbox', label: 'Inbox', value: { id: 'inbox' } }],
            createdAt: 'now',
          },
        },
      },
    },
    {
      name: 'invalid input interaction descriptor',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'running',
          updatedAt: 'now',
          interaction: {
            id: 'enter-title',
            kind: 'input',
            prompt: 'What title?',
            input: { type: 'object' },
            createdAt: 'now',
          },
        },
      },
    },
    {
      name: 'duplicate interaction option id',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'running',
          updatedAt: 'now',
          interaction: {
            id: 'choose-list',
            kind: 'choice',
            prompt: 'Which list?',
            options: [
              { id: 'same', label: 'First' },
              { id: 'same', label: 'Second' },
            ],
            createdAt: 'now',
          },
        },
      },
    },
    {
      name: 'approval without exact requests',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'running',
          updatedAt: 'now',
          interaction: {
            id: 'approve-delete',
            kind: 'approval',
            prompt: 'Delete these items?',
            proposal: {
              id: 'delete-items-v1',
              summary: 'Delete matching items.',
              requests: [],
            },
            createdAt: 'now',
          },
        },
      },
    },
    {
      name: 'non-portable result',
      response: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'completed',
          updatedAt: 'now',
          result: { complete: () => undefined },
        },
      },
    },
  ])('rejects an $name', ({ response }) => {
    expect(parseDurableOperationProtocolResponse(response)).toMatchObject({
      success: false,
      error: { kind: 'protocol-error', error: { code: 'invalid_response' } },
    });
  });

  it('parses declared family errors and rejects unknown error codes', () => {
    const error = durableOperationProtocolError(
      'inspection_unavailable',
      'Durable Operation observation is temporarily unavailable.',
    );

    expect(parseDurableOperationProtocolResponse(error)).toEqual({
      success: true,
      response: error,
    });
    expect(
      parseDurableOperationProtocolResponse({
        kind: 'protocol-error',
        error: { code: 'database_failed', message: 'Private failure.' },
      }),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_response' } },
    });
  });

  it('rejects a non-portable snapshot before transport authoring', () => {
    expect(() =>
      toDurableOperationSnapshotResponse({
        ...run,
        status: 'completed',
        updatedAt: '2026-08-30T23:50:02.000Z',
        result: { complete: () => undefined },
      }),
    ).toThrow('Durable Operation snapshot response is invalid.');
  });

  it('routes inspection through the common dispatcher with receiver-owned context', async () => {
    const context = { authority: { subject: 'user-1' } };
    const body = toDurableOperationProtocolRequest(run);
    const runtimeRequest = createRuntimeProtocolRequest({
      id: 'exchange-inspect',
      family: 'durable.operation',
      body,
    });
    const snapshot = toDurableOperationSnapshotResponse({
      ...run,
      status: 'running',
      updatedAt: '2026-08-30T23:50:01.000Z',
      progress: { phase: 'updating' },
    });
    const inspect = vi.fn(async () => snapshot);
    const dispatch = createRuntimeProtocolDispatcher({
      handlers: { 'durable.operation': inspect },
    });

    const response = await dispatch(runtimeRequest, context);

    expect(inspect).toHaveBeenCalledWith(body, context, {});
    expect(response).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'exchange-inspect',
      kind: 'response',
      family: 'durable.operation',
      body: snapshot,
    });
    expect(response).not.toHaveProperty('authority');
  });
});
