import { entity, field, graphSchema, withSelectionFactories } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  analyzeConsoleDocument,
  completeConsoleDocument,
  convertConsoleDocument,
  reflectSelectionLanguageEntity,
  reflectConsoleApplicationVariants,
} from '../index.js';

const Node = withSelectionFactories(
  entity('Node', { id: field.id(), type: field.enum(['part', 'chapter']), title: field.string() }),
  {
    identity: {
      version: 1,
      input: graphSchema.object({ id: field.string() }),
      template: { kind: 'identity', bindings: { id: 'id' } },
    },
    named: {
      version: 1,
      input: graphSchema.object({ title: field.string() }),
      scalarInput: 'title',
      template: { kind: 'predicate', fieldName: 'title', operator: 'eq', input: 'title' },
    },
  },
);
const Chapter = Node.variant('Chapter', { discriminator: { type: 'chapter' } });
const base = reflectSelectionLanguageEntity(Node);
const application = JSON.parse(
  JSON.stringify(reflectConsoleApplicationVariants([base], [Chapter.descriptor])),
);

describe('shared classified read reflection', () => {
  it.each(['ts', 'declarative'] as const)(
    'completes roots, narrowed fields, ordering and factories in %s before any execution',
    dialect => {
      const complete = (text: string) =>
        completeConsoleDocument(text, text.length, application, { dialect });
      expect(complete('Chap').items.some(item => item.label === 'Chapter')).toBe(true);
      const where = dialect === 'ts' ? 'Chapter.where(' : 'Chapter where ';
      expect(complete(where).items.map(item => item.label)).toContain('title');
      expect(complete(where + 'type = ').items.map(item => item.label)).toEqual(['"chapter"']);
      const order = dialect === 'ts' ? 'Chapter.orderBy(' : 'Chapter order by ';
      expect(complete(order).items.map(item => item.label)).toContain('title');
      expect(
        completeConsoleDocument(order, order.length, application, {
          dialect,
          orderableFields: name => (name === 'Chapter' ? ['title'] : []),
        }).items.map(item => item.label),
      ).toEqual(['title']);
      expect(
        complete(dialect === 'ts' ? 'Chapter.by({' : 'Chapter by ').items.map(item => item.label),
      ).toContain('named');
      const source =
        dialect === 'ts'
          ? 'Chapter.by({ named: "Intro" }).many()'
          : 'Chapter by named "Intro" many';
      const result = analyzeConsoleDocument(source, application, { dialect });
      expect(result.semanticDiagnostics).toEqual([]);
      expect(result.request?.selection).toEqual({
        kind: 'selection',
        entityName: 'Chapter',
        expression: { kind: 'predicate', fieldName: 'title', operator: 'eq', value: 'Intro' },
      });
      for (let end = 0; end <= source.length; end++)
        expect(() => complete(source.slice(0, end))).not.toThrow();
      const converted = convertConsoleDocument(
        source,
        application,
        dialect === 'ts' ? 'declarative' : 'ts',
        { dialect },
      );
      expect(converted).toBeDefined();
      expect(
        analyzeConsoleDocument(converted!, application, {
          dialect: dialect === 'ts' ? 'declarative' : 'ts',
        }).request,
      ).toEqual(result.request);
      const byIdentity =
        dialect === 'ts'
          ? 'Chapter.by({ identity: { id: "intro" } }).one()'
          : 'Chapter by identity { id: "intro" } one';
      expect(
        analyzeConsoleDocument(byIdentity, application, { dialect }).request?.selection,
      ).toEqual({
        kind: 'selection',
        entityName: 'Chapter',
        expression: Node.by({ identity: { id: 'intro' } }).toAst().expression,
      });
    },
  );

  it('does not invent roots from unavailable bases or invalid classifications, and leaves base reflection unchanged', () => {
    expect(reflectConsoleApplicationVariants([], [Chapter.descriptor]).entities).toEqual([]);
    expect(
      reflectConsoleApplicationVariants(
        [base],
        [{ ...Chapter.descriptor, discriminator: { fieldName: 'type', value: 'unknown' } }],
      ).entities,
    ).toEqual([base]);
    expect(base.fields.find(field => field.name === 'type')?.enumValues).toEqual([
      'part',
      'chapter',
    ]);
    expect(application.entities[1].variant.baseEntityName).toBe('Node');
  });
});
