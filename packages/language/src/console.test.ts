import { entity, field } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  analyzeConsoleDocument,
  completeConsoleDocument,
  parseConsoleDocument,
  reflectSelectionLanguageEntity,
} from './index.js';

const application = {
  entities: [
    {
      name: 'TodoItem',
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'title', type: 'string', nullable: false },
        { name: 'completed', type: 'boolean', nullable: false },
      ],
    },
  ],
} as const;

describe('Console Graph Read language', () => {
  it('reuses the Selection grammar inside a keyword-free Query expression', () => {
    const analysis = analyzeConsoleDocument(
      'TodoItem.where(completed = false and title = "Draft").many()',
      application,
    );

    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.syntax.expression).toMatchObject({
      kind: 'graph-read',
      entity: { kind: 'entity-name', text: 'TodoItem', from: 0, to: 8 },
      where: { kind: 'where-member', text: 'where' },
      selection: { kind: 'and' },
      terminal: { kind: 'many-member', text: 'many' },
    });
    expect(analysis.request).toEqual({
      version: 1,
      kind: 'graph-read',
      mode: 'run',
      selection: {
        kind: 'selection',
        entityName: 'TodoItem',
        expression: {
          kind: 'and',
          operands: [
            {
              kind: 'predicate',
              fieldName: 'completed',
              operator: 'eq',
              value: false,
            },
            { kind: 'predicate', fieldName: 'title', operator: 'eq', value: 'Draft' },
          ],
        },
      },
      orderBy: [],
      limit: 25,
      cardinality: 'many',
    });
  });

  it('keeps unknown Entities separate from nested Selection diagnostics', () => {
    expect(analyzeConsoleDocument('Missing.where(all).many()', application)).toMatchObject({
      syntaxDiagnostics: [],
      semanticDiagnostics: [
        {
          channel: 'semantic',
          code: 'console.semantic.unknown-entity',
          message: 'Unknown Entity Missing.',
          from: 0,
          to: 7,
        },
      ],
    });
    expect(
      analyzeConsoleDocument('TodoItem.where(missing = true).many()', application),
    ).toMatchObject({
      syntaxDiagnostics: [],
      semanticDiagnostics: [
        {
          channel: 'semantic',
          code: 'selection.semantic.unknown-field',
          from: 15,
          to: 22,
        },
      ],
    });
  });

  it('reports an incomplete terminal as Console syntax rather than Selection semantics', () => {
    expect(parseConsoleDocument('TodoItem.where(completed = false)')).toMatchObject({
      syntaxDiagnostics: [
        {
          channel: 'syntax',
          code: 'console.syntax.invalid',
          message: 'Expected .many() after the Selection expression.',
        },
      ],
    });
  });

  it('reuses Selection completions at their full-document source range', () => {
    expect(completeConsoleDocument('To', 2, application)).toMatchObject({
      from: 0,
      to: 2,
      items: [{ label: 'TodoItem', apply: 'TodoItem', kind: 'entity' }],
    });

    const document = 'TodoItem.where(comp).many()';
    const position = document.indexOf('comp') + 4;
    const completion = completeConsoleDocument(document, position, application);
    expect(completion).toMatchObject({
      from: document.indexOf('comp'),
      to: document.indexOf('comp') + 4,
    });
    expect(completion.items).toContainEqual(
      expect.objectContaining({ label: 'completed', apply: 'completed', kind: 'field' }),
    );
  });

  it('projects Core Entity definitions into the existing Selection reflection input', () => {
    const TodoList = entity('TodoList', { id: field.id(), name: field.string() });
    const TodoItem = entity('TodoItem', {
      id: field.id(),
      list: field.ref(TodoList),
      completed: field.boolean(),
    }).manyToMany('children', entity('Child', { id: field.id() }));

    expect(reflectSelectionLanguageEntity(TodoItem)).toEqual({
      name: 'TodoItem',
      fields: [
        { name: 'id', type: 'id', nullable: false },
        {
          name: 'list',
          type: 'reference',
          nullable: false,
          reference: {
            entityName: 'TodoList',
            identity: { name: 'refById', fields: ['id'] },
          },
        },
        { name: 'completed', type: 'boolean', nullable: false },
      ],
      relations: [{ name: 'list' }, { name: 'children' }],
    });
  });
});
