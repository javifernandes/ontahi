import { describe, expect, it } from 'vitest';

import type { ExchangeDiagnosticEvent, ObservationDiagnosticEvent } from '../diagnostics.js';

import {
  activityEntryEvent,
  activityEntryOutcome,
  activityEntryTitle,
  buildActivityEntries,
  exchangeInteractionState,
  formatSelectionExpression,
  graphCommandText,
  graphCommandSummary,
  graphReadSummary,
  isRecord,
  matchesFilter,
  operationProgressState,
  outcomeColor,
  semanticSummary,
  viewFields,
  type ExchangeActivity,
  type OperationProgressActivity,
} from './activity-model.js';

const exchangeActivity = (body: unknown, family = 'operation'): ExchangeActivity => ({
  id: 'exchange-1',
  at: 1,
  started: {
    kind: 'exchange.started',
    exchangeId: 'exchange-1',
    requestId: 'request-1',
    family,
    transportId: 'http',
    transportKind: 'fetch',
    startedAt: 1,
    at: 1,
    request: {
      protocol: 'ontahi.runtime',
      version: 1,
      kind: 'request',
      family,
      body,
    },
  },
});

describe('Devtools activity model', () => {
  it('names pending Operation interactions instead of generic progress', () => {
    const activity = (interaction: unknown): OperationProgressActivity => ({
      id: 'observation-1',
      at: 1,
      snapshots: [
        {
          kind: 'observation.snapshot',
          observationId: 'observation-1',
          family: 'durable.operation.observe',
          run: { taskId: 'Todo.delete', runId: 'run-1' },
          transportId: 'websocket',
          transportKind: 'websocket',
          startedAt: 1,
          at: 1,
          sequence: 1,
          snapshot: {
            taskId: 'Todo.delete',
            runId: 'run-1',
            status: 'running',
            updatedAt: '2026-01-01T00:00:00.000Z',
            interaction,
          },
        },
      ],
    });
    expect(
      operationProgressState(
        activity({
          kind: 'approval',
          proposal: { summary: 'Delete 5 items from “Inbox”.' },
        }),
      ),
    ).toEqual({
      label: 'approval requested',
      title: 'Approval requested · Delete 5 items from “Inbox”.',
    });
    expect(
      operationProgressState(
        activity({ kind: 'choice', prompt: 'Which “Shopping” list should be emptied?' }),
      ),
    ).toEqual({
      label: 'choice requested',
      title: 'Choice requested · Which “Shopping” list should be emptied?',
    });
    expect(operationProgressState(activity({ kind: 'unknown' }))).toEqual({
      label: 'running',
      title: 'running',
    });
  });

  it('projects a pending model response as its semantic interaction', () => {
    const exchange = exchangeActivity(
      { version: 1, kind: 'model-command', text: 'add item buy milk' },
      'model.command',
    );
    const settled: ExchangeActivity = {
      ...exchange,
      settled: {
        kind: 'exchange.settled',
        exchangeId: 'exchange-1',
        requestId: 'request-1',
        family: 'model.command',
        transportId: 'http',
        transportKind: 'fetch',
        startedAt: 1,
        at: 2,
        durationMs: 1,
        outcome: 'success',
        response: {
          protocol: 'ontahi.runtime',
          version: 1,
          kind: 'response',
          family: 'model.command',
          body: {
            kind: 'model-command-result',
            result: {
              status: 'pending',
              message: 'Which list?',
              interaction: {
                kind: 'choice',
                prompt: 'Which list?',
                options: [
                  { id: 'inbox', label: 'Inbox' },
                  { id: 'later', label: 'Later' },
                ],
              },
            },
          },
        },
      },
    };

    expect(exchangeInteractionState(settled)).toEqual({
      label: 'choice requested',
      title: 'Choice requested · Which list?',
      optionCount: 2,
    });
  });

  it('shows canonical relation membership and source predicates in both dialects', () => {
    const image = {
      kind: 'relation-image',
      relationName: 'items',
      source: {
        kind: 'selection',
        entityName: 'List',
        expression: { kind: 'predicate', fieldName: 'id', operator: 'eq', value: 'inbox' },
      },
    };
    expect(formatSelectionExpression(image)).toBe(
      'memberOf(List.where(id eq "inbox").through("items"))',
    );
    expect(formatSelectionExpression(image, 'declarative')).toBe(
      'where member of (List where id = "inbox" through items)',
    );
    const body = {
      kind: 'graph-read',
      selection: {
        entityName: 'Item',
        expression: {
          kind: 'and',
          operands: [
            image,
            { kind: 'predicate', fieldName: 'completed', operator: 'eq', value: false },
          ],
        },
      },
    };
    expect(graphReadSummary(body, 'declarative')).toBe(
      'Item where member of (List where id = "inbox" through items) and completed = false',
    );
    expect(graphReadSummary(body)).toContain(
      'memberOf(List.where(id eq "inbox").through("items")) && completed eq false',
    );
  });
  it('projects declarative predicates from the captured tree, preserving nested grouping', () => {
    expect(
      formatSelectionExpression(
        {
          kind: 'and',
          operands: [
            {
              kind: 'or',
              operands: [
                {
                  kind: 'predicate',
                  fieldName: 'status',
                  operator: 'in',
                  values: ['open', 'done'],
                },
                { kind: 'predicate', fieldName: 'due', operator: 'isNull' },
              ],
            },
            {
              kind: 'not',
              operand: { kind: 'predicate', fieldName: 'priority', operator: 'gte', value: 2 },
            },
          ],
        },
        'declarative',
      ),
    ).toBe('where (status in ["open","done"] or due is null) and not (priority >= 2)');
    expect(formatSelectionExpression(undefined, 'declarative')).toBe('selection');
    expect(formatSelectionExpression({ kind: 'references', refs: [{}, {}] }, 'declarative')).toBe(
      'references (2)',
    );
    expect(formatSelectionExpression({ kind: 'redacted' }, 'declarative')).toBe('redacted (…)');
  });

  it.each([
    [{ mode: 'run' }, 'many'],
    [{ mode: 'count' }, 'count'],
    [{ mode: 'get', cardinality: 'one' }, 'one'],
    [{ mode: 'get', limit: 1 }, 'limit 1 · first'],
  ])('projects the captured read mode without inventing exists: %j', (mode, terminal) => {
    expect(
      graphReadSummary(
        {
          kind: 'graph-read',
          selection: { entityName: 'Tag', expression: { kind: 'all' } },
          ...mode,
        },
        'declarative',
      ),
    ).toBe(`Tag · ${terminal}`);
  });

  it('keeps view metadata, multiple ordering fields, and incomplete captures visible', () => {
    expect(
      graphReadSummary(
        {
          kind: 'graph-read',
          selection: { entityName: 'Tag', expression: { kind: 'none' } },
          orderBy: [
            { fieldName: 'name', direction: 'asc' },
            { fieldName: 'id', direction: 'desc' },
            {},
          ],
          view: { name: 'TagCard' },
        },
        'declarative',
      ),
    ).toBe('Tag where none · order by name ascending, id descending · as TagCard');
    expect(graphReadSummary({ kind: 'graph-read' }, 'declarative')).toBeUndefined();
    expect(
      semanticSummary(
        exchangeActivity({ kind: 'graph-read-capabilities', entityName: 'Tag' }, 'graph.read'),
        'declarative',
      ),
    ).toBe('Tag read capabilities');
    expect(
      semanticSummary(exchangeActivity({ kind: 'graph-read' }, 'graph.read'), 'declarative'),
    ).toBe('graph.read');
  });

  it('formats selection and view semantics across supported shapes', () => {
    expect(isRecord({ value: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(formatSelectionExpression(undefined)).toBe('selection');
    expect(formatSelectionExpression({ kind: 'all' })).toBe('all');
    expect(formatSelectionExpression({ kind: 'none' })).toBe('none');
    expect(formatSelectionExpression({ kind: 'references', refs: [{}, {}] })).toBe('byRef(2)');
    expect(
      formatSelectionExpression({ kind: 'predicate', fieldName: 'status', operator: 'isNull' }),
    ).toBe('where(status is null)');
    expect(
      formatSelectionExpression({
        kind: 'predicate',
        fieldName: 'status',
        operator: 'in',
        values: ['open', 'done'],
      }),
    ).toBe('where(status in ["open","done"])');
    expect(
      formatSelectionExpression({
        kind: 'and',
        operands: [
          { kind: 'predicate', fieldName: 'done', operator: 'eq', value: false },
          { kind: 'predicate', fieldName: 'title', operator: 'eq', value: 'Ship' },
        ],
      }),
    ).toBe('where(done eq false && title eq "Ship")');
    expect(
      formatSelectionExpression({
        kind: 'or',
        operands: [
          { kind: 'predicate', fieldName: 'priority', operator: 'eq', value: 1 },
          { kind: 'not', operand: { kind: 'none' } },
        ],
      }),
    ).toBe('where(priority eq 1 || not(none))');
    expect(formatSelectionExpression({ kind: 'custom' })).toBe('custom(…)');

    expect(graphReadSummary({ kind: 'other' })).toBeUndefined();
    expect(
      graphReadSummary({
        kind: 'graph-read',
        selection: { kind: 'selection', expression: { kind: 'all' } },
        orderBy: [{ nope: true }, { fieldName: 'title', direction: 'desc' }],
        limit: 5,
        view: { name: 'TodoCard' },
      }),
    ).toBe('UnknownEntity.all · orderBy title desc · limit 5 · as TodoCard');

    expect(viewFields(undefined)).toEqual([]);
    expect(
      viewFields({
        fields: {
          id: { kind: 'field-view' },
          raw: null,
          tags: {
            kind: 'relation-view',
            view: { fields: { name: { kind: 'field-view' } } },
          },
          owner: { kind: 'relation-view' },
        },
      }),
    ).toEqual(['id', 'raw', 'tags.name', 'owner']);
  });

  it('summarizes graph commands, permissions, and fallback exchanges', () => {
    expect(
      semanticSummary(
        exchangeActivity({
          kind: 'graph-command',
          command: { kind: 'entity-mutation-command', entityName: 'TodoItem', action: 'update' },
        }),
      ),
    ).toBe('TodoItem.update');
    expect(
      semanticSummary(
        exchangeActivity({
          kind: 'graph-command',
          command: {
            kind: 'relationship-command',
            action: 'add',
            relation: { fieldName: 'TodoItem.tags' },
          },
        }),
      ),
    ).toBe('TodoItem.tags.add');
    expect(
      semanticSummary(
        exchangeActivity({
          kind: 'graph-command',
          command: {
            kind: 'many-to-many-relationship-command',
            relation: { relationName: 'TodoItem.tags' },
          },
        }),
      ),
    ).toBe('TodoItem.tags.change');
    expect(
      semanticSummary(
        exchangeActivity({
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
        }),
      ),
    ).toBe('TodoList.items.move(todo-explorer, before: todo-inline-editing)');
    expect(
      semanticSummary(exchangeActivity({ kind: 'check-permission', operationId: 'Todo.remove' })),
    ).toBe('can Todo.remove()');
    expect(semanticSummary(exchangeActivity({ kind: 'invoke', operationId: 'Todo.add' }))).toBe(
      'Todo.add()',
    );
    expect(
      semanticSummary(
        exchangeActivity(
          { version: 1, kind: 'model-command', text: 'create list Groceries' },
          'model.command',
        ),
      ),
    ).toBe('Ask model · "create list Groceries"');
    expect(
      semanticSummary(
        exchangeActivity(
          {
            version: 1,
            kind: 'model-command',
            text: 'create a list with a deliberately long name that exceeds the activity title',
          },
          'model.command',
        ),
      ),
    ).toBe('Ask model · "create a list with a deliberately long name that exceeds the …"');
    expect(
      semanticSummary(
        exchangeActivity({ kind: 'graph-command', command: { kind: 'custom-command' } }),
      ),
    ).toBe('custom-command');
    expect(
      semanticSummary(exchangeActivity({ kind: 'graph-command', command: { kind: 42 } })),
    ).toBe('Graph command');
    expect(semanticSummary(exchangeActivity({ kind: 'unknown' }, 'custom.family'))).toBe(
      'custom.family',
    );
    expect(semanticSummary({ id: 'empty', at: 0 })).toBe('Runtime exchange');
  });

  it('renders canonical graph commands as compact source-like text', () => {
    expect(
      graphCommandText({
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'delete',
          entityName: 'TodoItem',
          target: {
            kind: 'selection',
            expression: {
              kind: 'and',
              operands: [
                { kind: 'predicate', fieldName: 'title', operator: 'eq', value: 'Bread' },
                {
                  kind: 'predicate',
                  fieldName: 'list',
                  operator: 'eq',
                  value: {
                    kind: 'entity-ref',
                    entityName: 'TodoList',
                    locator: { id: 'groceries' },
                  },
                },
              ],
            },
          },
        },
      }),
    ).toBe('delete TodoItem where title = "Bread" and list = TodoList {"id":"groceries"}');
    expect(
      graphCommandText({
        kind: 'graph-command',
        command: {
          kind: 'many-to-many-relationship-command',
          action: 'unlink',
          relation: {
            sourceEntityName: 'TodoItem',
            relationName: 'tags',
            targetEntityName: 'Tag',
          },
          sources: {
            entityName: 'TodoItem',
            selection: { kind: 'references', refs: [{ locator: { id: 'bread' } }] },
          },
          targets: {
            entityName: 'Tag',
            selection: { kind: 'references', refs: [{ locator: { id: 'shopping' } }] },
          },
        },
      }),
    ).toBe('unlink TodoItem.tags · TodoItem references (1) → Tag references (1)');
  });

  it('summarizes every ordered destination and composite identities', () => {
    const command = {
      kind: 'ordered-relationship-command',
      action: 'move',
      relation: { sourceEntityName: 'List', relationName: 'items' },
      member: { kind: 'entity-ref', locator: { tenant: 'acme', slug: 'draft' } },
    };

    expect(
      graphCommandSummary({
        kind: 'graph-command',
        command: {
          ...command,
          position: { after: { kind: 'entity-ref', locator: { id: 'published' } } },
        },
      }),
    ).toBe('List.items.move(tenant: acme, slug: draft, after: published)');
    expect(
      graphCommandSummary({
        kind: 'graph-command',
        command: {
          ...command,
          member: {
            kind: 'entity-ref',
            locator: { scope: { tenant: 'acme' }, segments: ['draft', 2] },
          },
          position: { at: 'end' },
        },
      }),
    ).toBe('List.items.move(scope: {"tenant":"acme"}, segments: ["draft",2], at: end)');
    expect(
      graphCommandSummary({
        kind: 'graph-command',
        command: { ...command, position: { at: 'start' } },
      }),
    ).toBe('List.items.move(tenant: acme, slug: draft, at: start)');
    expect(
      graphCommandSummary({
        kind: 'graph-command',
        command: { ...command, position: { at: 'middle' } },
      }),
    ).toBe('List.items.move(tenant: acme, slug: draft, destination: unknown)');
    expect(
      graphCommandSummary({
        kind: 'graph-command',
        command: { kind: 'ordered-relationship-command', relation: {}, position: null },
      }),
    ).toBe('Entity.relation.move(unknown, destination: unknown)');
  });

  it('correlates large progress streams without losing snapshots', () => {
    const exchangeBase = {
      exchangeId: 'exchange-progress',
      requestId: 'request-progress',
      family: 'operation',
      transportId: 'websocket',
      transportKind: 'websocket',
      startedAt: 10,
    } as const;
    const exchangeStarted: ExchangeDiagnosticEvent = {
      ...exchangeBase,
      kind: 'exchange.started',
      at: 10,
      request: {
        protocol: 'ontahi.runtime',
        version: 1,
        kind: 'request',
        family: 'operation',
        body: { kind: 'invoke', operationId: 'Todo.complete' },
      },
    };
    const exchangeSettled: ExchangeDiagnosticEvent = {
      ...exchangeBase,
      kind: 'exchange.settled',
      at: 20,
      durationMs: 10,
      outcome: 'success',
      response: {
        protocol: 'ontahi.runtime',
        version: 1,
        kind: 'response',
        family: 'operation',
        body: {
          kind: 'invocation-result',
          result: {
            ok: true,
            value: { taskId: 'Todo.complete', runId: 'run-1' },
          },
        },
      },
    };
    const observationBase = {
      observationId: 'observation-1',
      family: 'durable.operation.observe',
      run: { taskId: 'Todo.complete', runId: 'run-1' },
      transportId: 'websocket',
      transportKind: 'websocket',
      startedAt: 21,
    } as const;
    const observationStarted: ObservationDiagnosticEvent = {
      ...observationBase,
      kind: 'observation.started',
      at: 21,
    };
    const snapshots: ObservationDiagnosticEvent[] = Array.from({ length: 128 }, (_, index) => ({
      ...observationBase,
      kind: 'observation.snapshot',
      at: 22 + index,
      sequence: index + 1,
      snapshot: {
        taskId: 'Todo.complete',
        runId: 'run-1',
        status: 'running',
        updatedAt: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
      },
    }));
    const observationSettled: ObservationDiagnosticEvent = {
      ...observationBase,
      kind: 'observation.settled',
      at: 200,
      durationMs: 179,
      outcome: 'completed',
    };
    const standalone: ObservationDiagnosticEvent = {
      ...observationBase,
      observationId: 'observation-2',
      run: { taskId: 'Todo.other', runId: 'run-2' },
      kind: 'observation.snapshot',
      at: 300,
      sequence: 1,
      snapshot: {
        taskId: 'Todo.other',
        runId: 'run-2',
        status: 'running',
        updatedAt: '2026-01-01T00:01:00.000Z',
      },
    };
    const secondSameRun: ObservationDiagnosticEvent = {
      ...observationBase,
      observationId: 'observation-3',
      kind: 'observation.snapshot',
      at: 150,
      sequence: 1,
      snapshot: {
        taskId: 'Todo.complete',
        runId: 'run-1',
        status: 'running',
        updatedAt: '2026-01-01T00:00:30.000Z',
      },
    };

    const entries = buildActivityEntries([
      exchangeStarted,
      exchangeSettled,
      observationStarted,
      ...snapshots,
      observationSettled,
      secondSameRun,
      standalone,
    ]);
    const correlated = entries.find(entry => entry.kind === 'exchange')!;
    const standaloneEntry = entries.find(entry => entry.id === 'observation:observation-2')!;

    expect(entries).toHaveLength(3);
    expect(entries[0]?.id).toBe('observation:observation-2');
    expect(correlated.observation?.snapshots).toHaveLength(128);
    expect(correlated.observation?.snapshots[127]?.sequence).toBe(128);
    expect(activityEntryEvent(correlated)?.kind).toBe('exchange.settled');
    expect(activityEntryOutcome(correlated)).toBe('completed');
    expect(activityEntryTitle(correlated)).toBe('Todo.complete()');
    expect(activityEntryEvent(standaloneEntry)?.kind).toBe('observation.snapshot');
    expect(activityEntryOutcome(standaloneEntry)).toBe('pending');
    expect(activityEntryTitle(standaloneEntry)).toBe('Todo.other()');
  });

  it('projects a model approval lifecycle as one evolving semantic activity', () => {
    const modelIdentity = {
      exchangeId: 'ask-model',
      requestId: 'ask-model',
      family: 'model.command',
      transportId: 'http',
      transportKind: 'fetch',
      startedAt: 10,
    } as const;
    const controlIdentity = {
      exchangeId: 'approve-model',
      requestId: 'approve-model',
      family: 'durable.operation',
      transportId: 'websocket',
      transportKind: 'websocket',
      startedAt: 30,
    } as const;
    const observationIdentity = {
      observationId: 'model-run',
      family: 'durable.operation.observe',
      run: { taskId: 'ontahi.model-command', runId: 'run-1' },
      transportId: 'websocket',
      transportKind: 'websocket',
      startedAt: 21,
    } as const;
    const entries = buildActivityEntries([
      {
        ...modelIdentity,
        kind: 'exchange.started',
        at: 10,
        request: {
          protocol: 'ontahi.runtime',
          version: 1,
          kind: 'request',
          family: 'model.command',
          body: { kind: 'model-command', text: 'rename list Inbox to Today' },
        },
      },
      {
        ...modelIdentity,
        kind: 'exchange.settled',
        at: 20,
        durationMs: 10,
        outcome: 'success',
        response: {
          protocol: 'ontahi.runtime',
          version: 1,
          kind: 'response',
          family: 'model.command',
          body: {
            kind: 'model-command-result',
            result: {
              status: 'pending',
              run: { taskId: 'ontahi.model-command', runId: 'run-1' },
            },
          },
        },
      },
      {
        ...controlIdentity,
        kind: 'exchange.started',
        at: 30,
        request: {
          protocol: 'ontahi.runtime',
          version: 1,
          kind: 'request',
          family: 'durable.operation',
          body: {
            version: 1,
            kind: 'respond',
            run: { taskId: 'ontahi.model-command', runId: 'run-1' },
            response: { interactionId: 'approve-model-command', decision: 'approve' },
          },
        },
      },
      {
        ...controlIdentity,
        kind: 'exchange.settled',
        at: 31,
        durationMs: 1,
        outcome: 'success',
      },
      {
        ...observationIdentity,
        kind: 'observation.started',
        at: 21,
      },
      {
        ...observationIdentity,
        kind: 'observation.snapshot',
        at: 22,
        sequence: 1,
        snapshot: {
          ...observationIdentity.run,
          status: 'running',
          updatedAt: '2026-09-29T00:00:00.000Z',
        },
      },
      {
        ...observationIdentity,
        kind: 'observation.snapshot',
        at: 32,
        sequence: 2,
        snapshot: {
          ...observationIdentity.run,
          status: 'completed',
          updatedAt: '2026-09-29T00:00:01.000Z',
        },
      },
      {
        ...observationIdentity,
        kind: 'observation.settled',
        at: 33,
        durationMs: 12,
        outcome: 'completed',
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'exchange',
      observation: { snapshots: [{ sequence: 1 }, { sequence: 2 }] },
    });
    expect(activityEntryTitle(entries[0]!)).toBe('Ask model · "rename list Inbox to Today"');
    expect(activityEntryOutcome(entries[0]!)).toBe('completed');
  });

  it('correlates terminal inspection metadata and caused Graph refreshes into the durable activity', () => {
    const run = { taskId: 'TodoList.completeAll', runId: 'run-1' };
    const exchangeIdentity = {
      requestId: 'invoke-1',
      family: 'operation',
      transportId: 'websocket',
      transportKind: 'websocket',
      startedAt: 10,
    } as const;
    const observationIdentity = {
      observationId: 'operation-1',
      family: 'durable.operation.observe',
      run,
      transportId: 'websocket',
      transportKind: 'websocket',
      startedAt: 12,
    } as const;
    const inspectIdentity = {
      exchangeId: 'inspect-1',
      requestId: 'inspect-1',
      family: 'durable.operation',
      transportId: 'websocket',
      transportKind: 'websocket',
      startedAt: 20,
    } as const;
    const entries = buildActivityEntries([
      {
        ...exchangeIdentity,
        exchangeId: 'invoke-1',
        kind: 'exchange.started',
        at: 10,
        request: {
          protocol: 'ontahi.runtime',
          version: 1,
          kind: 'request',
          family: 'operation',
          body: { kind: 'invoke', operationId: 'TodoList.completeAll' },
        },
      },
      {
        ...exchangeIdentity,
        exchangeId: 'invoke-1',
        kind: 'exchange.settled',
        at: 11,
        durationMs: 1,
        outcome: 'success',
        response: {
          protocol: 'ontahi.runtime',
          version: 1,
          kind: 'response',
          family: 'operation',
          body: { kind: 'invocation-result', result: { ok: true, value: run } },
        },
      },
      { ...observationIdentity, kind: 'observation.started', at: 12 },
      {
        ...observationIdentity,
        kind: 'observation.snapshot',
        at: 18,
        sequence: 1,
        snapshot: {
          ...run,
          status: 'completed',
          updatedAt: '2026-09-29T00:00:01.000Z',
        },
      },
      {
        ...inspectIdentity,
        kind: 'exchange.started',
        at: 20,
        request: {
          protocol: 'ontahi.runtime',
          version: 1,
          kind: 'request',
          family: 'durable.operation',
          body: { version: 1, kind: 'inspect', run },
        },
      },
      {
        ...inspectIdentity,
        kind: 'exchange.settled',
        at: 21,
        durationMs: 1,
        outcome: 'success',
        response: {
          protocol: 'ontahi.runtime',
          version: 1,
          kind: 'response',
          family: 'durable.operation',
          metadata: { mutationCommitId: 'commit-1' },
        },
      },
      {
        observationId: 'todos-observation',
        family: 'graph.observe',
        transportId: 'websocket',
        transportKind: 'websocket',
        startedAt: 1,
        kind: 'graph-observation.snapshot',
        at: 22,
        sequence: 2,
        rowCount: 3,
        causedBy: {
          kind: 'committed-mutations',
          commitIds: ['commit-1'],
          overflow: false,
        },
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'exchange',
      mutationCommitId: 'commit-1',
      derivedRefreshes: [{ observationId: 'todos-observation', sequence: 2, rowCount: 3 }],
    });
  });

  it('hides successful durable inspection exchanges unless internal activity is requested', () => {
    const identity = {
      exchangeId: 'inspect-model',
      requestId: 'inspect-model',
      family: 'durable.operation',
      transportId: 'websocket',
      transportKind: 'websocket',
      startedAt: 10,
    } as const;
    const events = [
      {
        ...identity,
        kind: 'exchange.started',
        at: 10,
        request: {
          protocol: 'ontahi.runtime',
          version: 1,
          kind: 'request',
          family: 'durable.operation',
          body: {
            version: 1,
            kind: 'inspect',
            run: { taskId: 'ontahi.model-command', runId: 'run-1' },
          },
        },
      },
      {
        ...identity,
        kind: 'exchange.settled',
        at: 11,
        durationMs: 1,
        outcome: 'success',
      },
    ] as const;

    expect(buildActivityEntries(events)).toEqual([]);
    const entries = buildActivityEntries(events, { includeInternal: true });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'exchange',
      internal: true,
      exchange: { id: 'inspect-model' },
    });
  });

  it('maps outcomes and filters secondary metadata', () => {
    expect(outcomeColor('success')).toBe('#62d899');
    expect(outcomeColor('completed')).toBe('#62d899');
    expect(outcomeColor('pending')).toBe('#ddb45f');
    expect(outcomeColor('aborted')).toBe('#93a69c');
    expect(outcomeColor('consumer-closed')).toBe('#93a69c');
    expect(outcomeColor('failed')).toBe('#ec7d78');
    expect(matchesFilter(['TodoItem', 42, undefined], 'todo')).toBe(true);
    expect(matchesFilter(['TodoItem', 42, undefined], 'missing')).toBe(false);
  });
});
