import { describe, expect, it } from 'vitest';

import { applySelectionExpression } from './in-memory/query.js';

import {
  compileSelectionExpression,
  createDeleteCommandSpec,
  entity,
  field,
  mapEntity,
  query,
  selectionAll,
  selectionAnd,
  selectionNone,
  selectionNot,
  selectionOr,
  Selection,
  toSelectionAst,
} from './index.js';

describe('selection AST', () => {
  const Book = entity('Book', {
    id: field.id(),
    status: field.string(),
    createdAt: field.string(),
  });

  mapEntity(Book).toTable('books', {
    createdAt: 'created_at',
  });

  it('extracts membership from a query without read shaping', () => {
    const querySpec = query(Book)
      .where(book => book.status.eq('draft'))
      .where(book => book.createdAt.lt('2026-01-01'))
      .select(book => ({ id: book.id }))
      .orderBy(book => book.createdAt)
      .limit(10)
      .build();

    expect(toSelectionAst(querySpec)).toEqual({
      kind: 'selection',
      entityName: 'Book',
      expression: {
        kind: 'and',
        operands: [
          { kind: 'predicate', operator: 'eq', fieldName: 'status', value: 'draft' },
          { kind: 'predicate', operator: 'lt', fieldName: 'createdAt', value: '2026-01-01' },
        ],
      },
    });
  });

  it('copies collection values so the AST is detached from its source', () => {
    const statuses = ['draft'];
    const querySpec = query(Book)
      .where(book => book.status.in(statuses))
      .build();
    const selection = toSelectionAst(querySpec);

    statuses.push('published');

    expect(selection.expression).toEqual({
      kind: 'predicate',
      operator: 'in',
      fieldName: 'status',
      values: ['draft'],
    });
  });

  it('uses the same membership AST for reads and command targets', () => {
    const querySpec = query(Book)
      .where(book => book.status.eq('draft'))
      .build();
    const commandSpec = createDeleteCommandSpec(Book, querySpec.selection);

    expect(toSelectionAst(commandSpec)).toEqual(toSelectionAst(querySpec));
  });

  it('stores recursive selection expressions directly on query specs', () => {
    const querySpec = query(Book)
      .where(book =>
        selectionOr(book.status.eq('draft'), selectionNot(book.createdAt.lt('2026-01-01'))),
      )
      .build();

    expect(querySpec.selection).toEqual({
      kind: 'or',
      operands: [
        { kind: 'predicate', operator: 'eq', fieldName: 'status', value: 'draft' },
        {
          kind: 'not',
          operand: {
            kind: 'predicate',
            operator: 'lt',
            fieldName: 'createdAt',
            value: '2026-01-01',
          },
        },
      ],
    });
  });

  it('evaluates recursive set composition in memory', () => {
    const draft = query(Book)
      .where(book => book.status.eq('draft'))
      .build().selection;
    const old = query(Book)
      .where(book => book.createdAt.lt('2026-01-01'))
      .build().selection;
    const rows = [
      { id: '1', status: 'draft', createdAt: '2025-01-01' },
      { id: '2', status: 'draft', createdAt: '2026-05-01' },
      { id: '3', status: 'published', createdAt: '2025-01-01' },
    ];

    expect(applySelectionExpression(rows, selectionAnd(draft, old))).toEqual([rows[0]]);
    expect(applySelectionExpression(rows, selectionOr(draft, old))).toEqual(rows);
    expect(applySelectionExpression(rows, selectionNot(draft))).toEqual([rows[2]]);
    expect(applySelectionExpression(rows, selectionNone())).toEqual([]);
    expect(applySelectionExpression(rows, selectionAll())).toEqual(rows);
  });

  it('compiles recursive expressions through entity mapping metadata', () => {
    const draft = query(Book)
      .where(book => book.status.eq('draft'))
      .build().selection;
    const old = query(Book)
      .where(book => book.createdAt.lt('2026-01-01'))
      .build().selection;

    expect(compileSelectionExpression(Book, selectionOr(draft, selectionNot(old)))).toEqual({
      kind: 'or',
      operands: [
        { operator: 'eq', field: 'status', column: 'status', value: 'draft' },
        {
          kind: 'not',
          operand: {
            operator: 'lt',
            field: 'createdAt',
            column: 'created_at',
            value: '2026-01-01',
          },
        },
      ],
    });
  });

  it('preserves reference selections and lowers locators only for execution', () => {
    const ReferencableBook = entity('ReferencableBook', {
      id: field.id(),
      edition: field.string(),
    }).locators({
      refById: 'id',
      refByEdition: ['id', 'edition'],
    });
    mapEntity(ReferencableBook).toTable('books');
    const selection = Selection.references(ReferencableBook, [
      { kind: 'entity-ref', entityName: 'ReferencableBook', locator: { id: 'book-1' } },
      {
        kind: 'entity-ref',
        entityName: 'ReferencableBook',
        locator: { id: 'book-2', edition: 'second' },
      },
    ]);

    expect(selection.toAst().expression).toEqual({
      kind: 'references',
      refs: [
        { kind: 'entity-ref', entityName: 'ReferencableBook', locator: { id: 'book-1' } },
        {
          kind: 'entity-ref',
          entityName: 'ReferencableBook',
          locator: { id: 'book-2', edition: 'second' },
        },
      ],
    });
    expect(compileSelectionExpression(ReferencableBook, selection.expression)).toEqual({
      kind: 'or',
      operands: [
        { operator: 'eq', field: 'id', column: 'id', value: 'book-1' },
        {
          kind: 'and',
          operands: [
            { operator: 'eq', field: 'id', column: 'id', value: 'book-2' },
            { operator: 'eq', field: 'edition', column: 'edition', value: 'second' },
          ],
        },
      ],
    });
    expect(
      applySelectionExpression(
        [
          { id: 'book-1', edition: 'first' },
          { id: 'book-2', edition: 'second' },
          { id: 'book-3', edition: 'third' },
        ],
        selection.expression,
      ),
    ).toHaveLength(2);
  });
});
