import { describe, expect, it } from 'vitest';

import type { ExchangeDiagnosticEvent, ObservationDiagnosticEvent } from '../diagnostics.js';

import {
  activityEntryEvent,
  activityEntryOutcome,
  activityEntryTitle,
  buildActivityEntries,
  formatSelectionExpression,
  graphReadSummary,
  isRecord,
  matchesFilter,
  outcomeColor,
  semanticSummary,
  viewFields,
  type ExchangeActivity,
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
      semanticSummary(exchangeActivity({ kind: 'check-permission', operationId: 'Todo.remove' })),
    ).toBe('can Todo.remove()');
    expect(semanticSummary(exchangeActivity({ kind: 'invoke', operationId: 'Todo.add' }))).toBe(
      'Todo.add()',
    );
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
