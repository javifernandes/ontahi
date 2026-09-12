import { entity, field, query, Selection } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import type { SqlDialect } from './dialect.js';
import { sqlMapping } from './mapping.js';
import { createSqlQueryCompiler } from './query.js';

const Item = entity('Item', { id: field.id(), title: field.string() });
const mapping = sqlMapping({
  entity: Item,
  table: 'items',
  columns: { id: 'item_id', title: 'title' },
});
const dialect: SqlDialect = {
  quoteIdentifier: name => `[${name}]`,
  placeholder: index => `:p${index}`,
  countExpression: 'COUNT(*)',
  order: (expression, direction) => `${expression} ${direction}`,
};
const compiler = createSqlQueryCompiler(dialect);

describe('SQL compiler dialect boundary', () => {
  it('rejects relation-image membership instead of dropping traversal in reads or mutations', () => {
    const Group = entity('Group', { id: field.id() }).hasMany('items', Item);
    const selected = Selection.all(Group).through('items');
    expect(() => compiler.compileQuery(selected.toQuery(), undefined, mapping)).toThrow(
      'relation-image',
    );
    expect(() => compiler.compileSelection(selected.not().expression, mapping, [])).toThrow(
      'relation-image',
    );
  });
  it('parameterizes values and delegates physical syntax while preserving semantic projection', () => {
    const compiled = compiler.compileQuery(
      query(Item)
        .where(item => item.title.eq("x' OR 1=1"))
        .select(item => ({ label: item.title }))
        .orderBy(item => item.title.desc()),
      undefined,
      mapping,
    );
    expect(compiled).toEqual({
      text: 'SELECT [title] AS [title] FROM [items] WHERE [title] = :p1 ORDER BY [title] desc',
      values: ["x' OR 1=1"],
    });
  });
  it('counts without projection, order or result limit', () => {
    expect(
      compiler.compileQuery(
        query(Item)
          .limit(1)
          .orderBy(item => item.title),
        undefined,
        mapping,
        { count: true },
      ),
    ).toEqual({ text: 'SELECT COUNT(*) AS [count] FROM [items] WHERE TRUE', values: [] });
  });
  it('keeps an empty membership predicate false without placeholders', () => {
    expect(
      compiler.compileSelection(
        { kind: 'predicate', operator: 'in', fieldName: 'id', values: [] },
        mapping,
        [],
      ),
    ).toBe('FALSE');
  });
});
