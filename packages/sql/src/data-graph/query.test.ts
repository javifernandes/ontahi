import { entity, field, query, Selection, mapRelation } from '@ontahi/core/data-graph';
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
  it('compiles opted-in relation membership without enabling mutation selection compilation', () => {
    const Group = entity('Group', { id: field.id() });
    const Entry = entity('Entry', { id: field.id(), group: field.ref(Group) });
    const Groups = Group.hasMany('entries', Entry, { via: 'group' });
    const sourceMapping = sqlMapping({
      entity: Groups,
      table: '__ontahi_image_0',
      columns: { id: 'pk' },
    });
    const targetMapping = sqlMapping({
      entity: Entry,
      table: 'entries',
      columns: { id: 'pk', group: 'group_id' },
    });
    const selected = Selection.where(Groups, g => g.id.eq('g1')).through('entries');
    const result = compiler.compileQuery(selected.toQuery(), undefined, targetMapping, {
      selectionMappings: [sourceMapping, targetMapping],
    });
    expect(result.values).toEqual(['g1']);
    expect(result.text).toContain('AS [__ontahi_image_1]');
    expect(result.text).toContain('[__ontahi_image_1].[pk] = [entries].[group_id]');
    expect(() => compiler.compileSelection(selected.build(), targetMapping, [])).toThrow(
      'relation-image',
    );
  });
  it('rejects unmapped many-to-many joins and composite edge identities', () => {
    const Target = entity('EdgeTarget', { tenant: field.string(), key: field.string() })
      .locators({ identity: ['tenant', 'key'] })
      .identity('identity');
    const Owner = entity('EdgeOwner', { id: field.id() }).manyToMany('targets', Target);
    const sourceMapping = sqlMapping({ entity: Owner, table: 'owners', columns: { id: 'id' } });
    const targetMapping = sqlMapping({
      entity: Target,
      table: 'targets',
      columns: { tenant: 'tenant', key: 'key' },
    });
    mapRelation(Owner, 'targets', {
      type: 'many-to-many',
      from: 'owners.id',
      to: 'targets.key',
      through: { table: 'edges', fromColumn: 'owner', toColumn: 'target' },
    });
    expect(() =>
      compiler.compileQuery(
        Selection.all(Owner).through('targets').toQuery(),
        undefined,
        targetMapping,
        { selectionMappings: [sourceMapping, targetMapping] },
      ),
    ).toThrow('composite edge joins');
    const Owners = entity('Owner', { id: field.id() }).manyToMany('items', Item);
    const ownerMapping = sqlMapping({ entity: Owners, table: 'owners', columns: { id: 'id' } });
    expect(() =>
      compiler.compileQuery(Selection.all(Owners).through('items').toQuery(), undefined, mapping, {
        selectionMappings: [ownerMapping, mapping],
      }),
    ).toThrow('matching relation and Entity mappings');
  });
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
