// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SemanticPayload } from './semantic-payload.js';

afterEach(cleanup);

describe('SemanticPayload', () => {
  it('shows Operation inputs and values without protocol wrappers', () => {
    const ui = render(
      <SemanticPayload
        value={{
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
        }}
      />,
    );
    expect(screen.getByText('Input')).toBeTruthy();
    expect(screen.getByText('list-later')).toBeTruthy();
    expect(screen.queryByText('operationId')).toBeNull();

    ui.rerender(
      <SemanticPayload
        value={{
          kind: 'invocation-result',
          result: {
            ok: true,
            kind: 'success',
            value: {
              owner: {
                kind: 'entity-ref',
                entityName: 'User',
                locator: { tenant: 'acme', slug: 'javi', scope: null, path: { team: 'runtime' } },
              },
            },
          },
        }}
      />,
    );
    expect(screen.getByText('Returned value')).toBeTruthy();
    expect(
      screen.getByText('tenant: acme · slug: javi · scope: null · path: {"team":"runtime"}'),
    ).toBeTruthy();
    expect(screen.queryByText('entity-ref')).toBeNull();
  });

  it('projects empty inputs, void results, failures, permissions, and protocol errors', () => {
    const ui = render(<SemanticPayload value={{ kind: 'invoke' }} />);
    expect(screen.getByText('No input.')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{ kind: 'invocation-result', result: { ok: true, kind: 'success' } }}
      />,
    );
    expect(screen.getByText('No value returned.')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{
          kind: 'invocation-result',
          result: { ok: true, kind: 'success', value: { title: 'Buy milk' } },
          resourceEvidence: {
            visibility: 'summary',
            model: {
              attempts: 2,
              reportedAttempts: 1,
              failedAttempts: 1,
            },
          },
        }}
      />,
    );
    expect(screen.getByText('Resource usage summary')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Attempts · 2' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Reported attempts · 1' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Failed attempts · 1' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: /Duration/ })).toBeNull();
    expect(screen.queryByText(/openai/)).toBeNull();

    ui.rerender(
      <SemanticPayload
        value={{
          kind: 'invocation-result',
          result: {
            ok: false,
            kind: 'rejected',
            executed: false,
            reason: 'policy',
            message: 'Not allowed',
          },
        }}
      />,
    );
    expect(screen.getByText('Failure')).toBeTruthy();
    expect(screen.getByText('Not allowed')).toBeTruthy();
    expect(screen.queryByText('executed')).toBeNull();

    ui.rerender(
      <SemanticPayload
        value={{ kind: 'permission-result', result: { allowed: false, reason: 'owner-only' } }}
      />,
    );
    expect(screen.getByText('Permission')).toBeTruthy();
    expect(screen.getByText('owner-only')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{ kind: 'protocol-error', error: { code: 'invalid_request', message: 'Bad input' } }}
      />,
    );
    expect(screen.getByText('Protocol error')).toBeTruthy();
    expect(screen.getByText('Bad input')).toBeTruthy();
  });

  it('shows model prompts, outcomes, and canonical executed actions', () => {
    const ui = render(
      <SemanticPayload
        value={{
          version: 1,
          kind: 'model-command',
          text: 'rename list Inbox to Today',
          language: 'en-US',
        }}
      />,
    );
    expect(screen.getByText('rename list Inbox to Today')).toBeTruthy();
    expect(screen.getByText('en-US')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{
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
          resourceEvidence: {
            visibility: 'debug',
            model: {
              attemptOutcomes: [
                {
                  outcome: 'failed',
                  usageReported: false,
                  activity: {
                    attemptId: 'attempt-0',
                    correlationId: 'execution-1',
                    admission: { attempt: 1, maxAttempts: 3 },
                  },
                },
              ],
              attempts: [
                {
                  provider: 'openai',
                  model: 'gpt-test',
                  inputTokens: 120,
                  outputTokens: 18,
                  totalTokens: 138,
                  cachedInputTokens: 40,
                  cacheWriteInputTokens: 3,
                  reasoningTokens: 6,
                  durationMs: 250,
                  activity: {
                    attemptId: 'attempt-1',
                    correlationId: 'execution-1',
                    owner: { kind: 'intent-resolution', id: 'ontahi.model-command' },
                    origin: { channel: 'web', surface: 'command-chat', clientInstanceId: 'tab-1' },
                    admission: { attempt: 1, maxAttempts: 3, maxOutputTokens: 1_024 },
                  },
                },
                {
                  provider: 'ollama',
                  model: 'local-test',
                  activity: {
                    attemptId: 'attempt-2',
                    correlationId: 'execution-2',
                  },
                },
                {
                  provider: 'deepseek',
                  model: 'deepseek-test',
                  activity: {
                    owner: {},
                    origin: { channel: 'cli' },
                  },
                },
                {},
                'redacted',
              ],
            },
          },
        }}
      />,
    );
    expect(screen.getByText('List renamed.')).toBeTruthy();
    expect(screen.getByText('executed')).toBeTruthy();
    expect(screen.getByText('Canonical action')).toBeTruthy();
    expect(screen.getByText('TodoList.rename')).toBeTruthy();
    expect(screen.getAllByText('Resource usage')).toHaveLength(4);
    expect(screen.getByText('Resource attempt')).toBeTruthy();
    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Usage reported · no' })).toBeTruthy();
    expect(screen.getByText('openai · gpt-test')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Input · 120 tokens' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Total · 138 tokens' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Cached input · 40 tokens' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Cache write · 3 tokens' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Reasoning · 6 tokens' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Duration · 250 ms' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Attempt · attempt-1' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Correlation · execution-1' })).toBeTruthy();
    expect(
      screen.getByRole('group', { name: 'Owner · intent-resolution: ontahi.model-command' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('group', { name: 'Origin · web · command-chat · client tab-1' }),
    ).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Admission · Attempt 1 of 3' })).toBeTruthy();
    expect(
      screen.getByRole('group', { name: 'Generation ceiling · 1024 output tokens' }),
    ).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Attempt · attempt-2' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Correlation · execution-2' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Attempt · unknown' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Correlation · unknown' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Owner · activity: unknown' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Origin · cli' })).toBeTruthy();
    expect(screen.getByText('model · unknown')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{
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
        }}
      />,
    );
    expect(screen.getByText('Found one item.')).toBeTruthy();
    expect(screen.getByText('Canonical read')).toBeTruthy();
    expect(screen.getByText('Read result')).toBeTruthy();
    expect(screen.getByText('Buy bread')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{
          version: 1,
          kind: 'model-command-result',
          result: {
            status: 'executed',
            message: 'Custom result.',
            request: { kind: 'invoke', operationId: 'Todo.inspect', input: {} },
            response: { kind: 'custom-result', value: 'raw' },
          },
        }}
      />,
    );
    expect(screen.getByText('Canonical action')).toBeTruthy();
    expect(screen.getByText('custom-result')).toBeTruthy();
    expect(screen.getByText('raw')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{
          version: 1,
          kind: 'model-command',
          text: 'help',
        }}
      />,
    );
    expect(screen.getByText('Runtime default.')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{
          version: 1,
          kind: 'model-command-result',
          result: { status: 'answered', message: 'You can create and rename lists.' },
        }}
      />,
    );
    expect(screen.getByText('answered')).toBeTruthy();
    expect(screen.queryByText('Canonical action')).toBeNull();

    ui.rerender(
      <SemanticPayload
        value={{ version: 1, kind: 'model-command-result', result: 'invalid result' }}
      />,
    );
    expect(screen.getByText('invalid result')).toBeTruthy();
  });

  it('renders generic scalars, arrays, records, and graph read results', () => {
    const ui = render(<SemanticPayload value={[1, 'two', null]} />);
    expect(screen.getByText('1, two, null')).toBeTruthy();

    ui.rerender(<SemanticPayload value={[]} />);
    expect(screen.getByText('Empty list')).toBeTruthy();

    ui.rerender(
      <SemanticPayload
        value={{
          kind: 'graph-read-result',
          value: [{ id: 'todo-1', done: true, meta: { rank: 1 } }],
        }}
      />,
    );
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('todo-1')).toBeTruthy();
    expect(screen.getByText('1 fields')).toBeTruthy();

    ui.rerender(<SemanticPayload value='done' />);
    expect(screen.getByText('done')).toBeTruthy();
  });

  it('renders ordered movement as source, member, and destination cards', () => {
    const ui = render(
      <SemanticPayload
        value={{
          kind: 'graph-command',
          command: {
            kind: 'ordered-relationship-command',
            action: 'move',
            relation: {
              sourceEntityName: 'TodoList',
              relationName: 'items',
              targetEntityName: 'TodoItem',
              cardinality: 'ordered-many',
            },
            source: { kind: 'entity-ref', entityName: 'TodoList', locator: { id: 'list-inbox' } },
            member: {
              kind: 'entity-ref',
              entityName: 'TodoItem',
              locator: { id: 'todo-explorer' },
            },
            position: {
              before: {
                kind: 'entity-ref',
                entityName: 'TodoItem',
                locator: { id: 'todo-inline-editing' },
              },
            },
          },
        }}
      />,
    );

    expect(
      screen.getByText('TodoList.items.move(todo-explorer, before: todo-inline-editing)'),
    ).toBeTruthy();
    expect(screen.getByText('Source / List')).toBeTruthy();
    expect(screen.getByText('Moving item')).toBeTruthy();
    expect(screen.getByText('todo-explorer')).toBeTruthy();
    expect(screen.getByText('Destination')).toBeTruthy();
    expect(screen.getByText('Before todo-inline-editing')).toBeTruthy();

    for (const [position, label] of [
      [
        {
          after: {
            kind: 'entity-ref',
            entityName: 'TodoItem',
            locator: { id: 'todo-review' },
          },
        },
        'After todo-review',
      ],
      [{ at: 'start' }, 'Start of list'],
      [{ at: 'end' }, 'End of list'],
      [{ at: 'middle' }, 'Unknown destination'],
    ] as const) {
      ui.rerender(
        <SemanticPayload
          value={{
            kind: 'graph-command',
            command: {
              kind: 'ordered-relationship-command',
              relation: { sourceEntityName: 'TodoList', relationName: 'items' },
              source: { kind: 'entity-ref', entityName: 'TodoList', locator: { id: 'list-inbox' } },
              member: { kind: 'entity-ref', entityName: 'TodoItem', locator: { id: 'todo-1' } },
              position,
            },
          }}
        />,
      );
      expect(screen.getByText(label)).toBeTruthy();
    }

    ui.rerender(
      <SemanticPayload
        value={{ kind: 'graph-command', command: { kind: 'custom-command', value: 1 } }}
      />,
    );
    expect(screen.getByText('custom-command')).toBeTruthy();
  });
});
