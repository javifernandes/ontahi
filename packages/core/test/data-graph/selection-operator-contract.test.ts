import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createInMemoryDataGraphRuntime,
  entity,
  field,
  graphSchema,
  query,
  safeParseGraphSchema,
  selection,
  value,
  type EntityProxy,
  type SelectionPredicate,
} from '../../src/data-graph/index.js';

describe('selection scalar operator contract', () => {
  const Item = entity('SelectionOperatorItem', {
    id: field.id(),
    score: field.integer(),
    note: field.nullable(field.string()),
  });
  const Input = value('SelectionOperatorInput', {
    items: graphSchema.selection(Item),
  });
  const dataset = {
    SelectionOperatorItem: [
      { id: 'item-1', score: 1, note: 'first' },
      { id: 'item-2', score: 2, note: 'second' },
      { id: 'item-3', score: 3, note: null },
    ],
  };

  const cases: ReadonlyArray<{
    name: string;
    build: (item: EntityProxy<typeof Item>) => SelectionPredicate;
    expression: SelectionPredicate;
    ids: string[];
  }> = [
    {
      name: 'eq',
      build: item => item.score.eq(2),
      expression: { kind: 'predicate', operator: 'eq', fieldName: 'score', value: 2 },
      ids: ['item-2'],
    },
    {
      name: 'in',
      build: item => item.score.in([1, 3]),
      expression: { kind: 'predicate', operator: 'in', fieldName: 'score', values: [1, 3] },
      ids: ['item-1', 'item-3'],
    },
    {
      name: 'isNull',
      build: item => item.note.isNull(),
      expression: { kind: 'predicate', operator: 'isNull', fieldName: 'note' },
      ids: ['item-3'],
    },
    {
      name: 'lt',
      build: item => item.score.lt(2),
      expression: { kind: 'predicate', operator: 'lt', fieldName: 'score', value: 2 },
      ids: ['item-1'],
    },
    {
      name: 'lte',
      build: item => item.score.lte(2),
      expression: { kind: 'predicate', operator: 'lte', fieldName: 'score', value: 2 },
      ids: ['item-1', 'item-2'],
    },
    {
      name: 'gt',
      build: item => item.score.gt(2),
      expression: { kind: 'predicate', operator: 'gt', fieldName: 'score', value: 2 },
      ids: ['item-3'],
    },
    {
      name: 'gte',
      build: item => item.score.gte(2),
      expression: { kind: 'predicate', operator: 'gte', fieldName: 'score', value: 2 },
      ids: ['item-2', 'item-3'],
    },
  ];

  it.each(cases)('$name survives authoring, transport, and in-memory execution', async testCase => {
    const authored = selection(Item, testCase.build);
    expect(authored.build()).toEqual(testCase.expression);

    const parsed = safeParseGraphSchema(Input, { items: authored.toAst() });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.items.build()).toEqual(testCase.expression);

    const runtime = createInMemoryDataGraphRuntime({ dataset });
    const rows = await Effect.runPromise(
      runtime.run(query(Item).where(parsed.data.items), undefined),
    );
    expect(rows.map(row => row.id)).toEqual(testCase.ids);
  });

  it('derives redundant operators through boolean composition', async () => {
    const runtime = createInMemoryDataGraphRuntime({ dataset });
    const between = selection(Item, item => item.score.gte(2)).and(item => item.score.lte(3));
    const notEqual = selection(Item, item => item.score.eq(2)).not();

    await expect(
      Effect.runPromise(runtime.run(query(Item).where(between), undefined)),
    ).resolves.toHaveLength(2);
    await expect(
      Effect.runPromise(runtime.run(query(Item).where(notEqual), undefined)),
    ).resolves.toMatchObject([{ id: 'item-1' }, { id: 'item-3' }]);
  });

  it('applies selections authored against another projection of the same semantic entity', async () => {
    const ProjectedItem = entity('SelectionOperatorItem', {
      id: field.id(),
      score: field.integer(),
      note: field.nullable(field.string()),
    });
    const projectedSelection = selection(ProjectedItem, item => item.score.gte(2));
    const runtime = createInMemoryDataGraphRuntime({ dataset });

    await expect(
      Effect.runPromise(runtime.run(query(Item).where(projectedSelection), undefined)),
    ).resolves.toMatchObject([{ id: 'item-2' }, { id: 'item-3' }]);
  });
});
