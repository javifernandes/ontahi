import { describe, expect, it } from 'vitest';

import {
  createRuntimeProtocolRegistry,
  createRuntimeProtocolRequest,
  modelCommandProtocolError,
  modelCommandProtocolResult,
  modelCommandRuntimeProtocolFamily,
  parseModelCommandProtocolRequest,
  parseModelCommandProtocolResponse,
  toModelCommandProtocolRequest,
} from './index.js';

const registry = createRuntimeProtocolRegistry([modelCommandRuntimeProtocolFamily] as const);

describe('Runtime Protocol model.command family', () => {
  it('canonically parses a natural-language request and optional interaction context', () => {
    const body = toModelCommandProtocolRequest({
      text: 'rename list Inbox to Today',
      language: 'en-US',
      context: { surface: 'todo-browser' },
    });
    const request = createRuntimeProtocolRequest({
      id: 'model-command-1',
      family: 'model.command',
      body,
    });

    expect(registry.parseRequest(JSON.parse(JSON.stringify(request)))).toEqual({
      success: true,
      request,
    });
  });

  it.each([
    { version: 2, kind: 'model-command', text: 'help' },
    { version: 1, kind: 'model-command', text: 'help', authority: 'admin' },
    { version: 1, kind: 'model-command', text: 42 },
    { version: 1, kind: 'other', text: 'help' },
  ])('fails closed for invalid family input', body => {
    expect(
      registry.parseRequest(
        createRuntimeProtocolRequest({
          id: 'invalid-model-command',
          family: 'model.command',
          body,
        }),
      ),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_family_request' } } });
  });

  it('rejects a non-object family body before reading its version', () => {
    expect(parseModelCommandProtocolRequest(null)).toEqual({
      success: false,
      error: {
        error: { code: 'invalid_request', message: 'Model command must be an object.' },
      },
    });
  });

  it('parses executed canonical actions and family errors', () => {
    const executed = modelCommandProtocolResult({
      status: 'executed',
      message: 'List renamed.',
      request: {
        kind: 'invoke',
        operationId: 'TodoList.rename',
        input: { id: 'list-1', name: 'Today' },
      },
    });
    expect(parseModelCommandProtocolResponse(executed)).toEqual({
      success: true,
      response: executed,
    });

    const error = modelCommandProtocolError('command_unauthorized', 'Sign in first.');
    expect(parseModelCommandProtocolResponse(error)).toEqual({ success: true, response: error });
  });

  it('returns the canonical parsed invocation without unknown transport fields', () => {
    expect(
      parseModelCommandProtocolResponse({
        version: 1,
        kind: 'model-command-result',
        result: {
          status: 'executed',
          message: 'List renamed.',
          request: {
            kind: 'invoke',
            operationId: 'TodoList.rename',
            input: { name: 'Today' },
            authority: 'caller-authored',
          },
        },
      }),
    ).toEqual({
      success: true,
      response: {
        version: 1,
        kind: 'model-command-result',
        result: {
          status: 'executed',
          message: 'List renamed.',
          request: {
            kind: 'invoke',
            operationId: 'TodoList.rename',
            input: { name: 'Today' },
          },
        },
      },
    });
  });

  it('parses message-only outcomes and canonical graph commands', () => {
    for (const status of ['answered', 'unresolved'] as const) {
      const response = {
        version: 1,
        kind: 'model-command-result',
        result: {
          status,
          message: status === 'answered' ? 'You can create lists.' : 'Which list?',
        },
      } as const;
      expect(parseModelCommandProtocolResponse(response)).toEqual({
        success: true,
        response,
      });
    }

    const graphResponse = {
      version: 1,
      kind: 'model-command-result',
      result: {
        status: 'executed',
        message: 'List deleted.',
        request: {
          version: 1,
          kind: 'graph-command',
          command: {
            kind: 'entity-mutation-command',
            action: 'delete',
            entityName: 'TodoList',
            target: {
              kind: 'entity-ref',
              entityName: 'TodoList',
              locator: { id: 'list-1' },
            },
          },
        },
      },
    } as const;
    expect(parseModelCommandProtocolResponse(graphResponse)).toEqual({
      success: true,
      response: graphResponse,
    });
  });

  it('parses a canonical graph read and its real protocol response', () => {
    const readResponse = {
      version: 1,
      kind: 'model-command-result',
      result: {
        status: 'executed',
        message: 'Found one item.',
        request: {
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
              value: false,
            },
          },
          orderBy: [],
        },
        response: {
          kind: 'graph-read-result',
          value: [{ id: 'todo-1', title: 'Buy bread', completed: false }],
        },
      },
    } as const;

    expect(parseModelCommandProtocolResponse(readResponse)).toEqual({
      success: true,
      response: readResponse,
    });
  });

  it('rejects malformed response envelopes before inspecting the result', () => {
    expect(parseModelCommandProtocolResponse(null)).toMatchObject({ success: false });
  });

  it.each([
    { version: 1, kind: 'model-command-result', result: { status: 'executed', message: 'Done' } },
    {
      version: 1,
      kind: 'model-command-result',
      result: { status: 'executed', message: 'Done', request: { kind: 'invented-command' } },
    },
    {
      version: 1,
      kind: 'model-command-result',
      result: { status: 'executed', message: 'Done', request: { kind: 'graph-command' } },
    },
    {
      version: 1,
      kind: 'model-command-result',
      result: {
        status: 'executed',
        message: 'Done',
        request: {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: { kind: 'selection', entityName: 'TodoItem', expression: { kind: 'all' } },
          orderBy: [],
        },
      },
    },
    {
      version: 1,
      kind: 'model-command-result',
      result: {
        status: 'executed',
        message: 'Done',
        request: { kind: 'invoke', operationId: 'Todo.help', input: {} },
        response: { kind: 'graph-read-result', value: [] },
      },
    },
    {
      version: 1,
      kind: 'model-command-result',
      result: { status: 'answered', message: 'Done', request: { kind: 'invoke' } },
    },
    {
      version: 1,
      kind: 'model-command-result',
      result: { status: 'answered', message: 'Done' },
      error: { code: 'unexpected', message: 'Extra variant payload' },
    },
    { version: 1, kind: 'model-command-result', result: { status: 'unknown', message: 'Done' } },
    { version: 1, kind: 'protocol-error', error: { message: 'Missing code' } },
  ])('rejects invalid family responses', response => {
    expect(parseModelCommandProtocolResponse(response)).toMatchObject({ success: false });
  });
});
