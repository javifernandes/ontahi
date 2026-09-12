import {
  entity,
  field,
  graphSchema,
  Selection,
  withContextualSelections,
  withSelectionFactories,
} from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  analyzeConsoleDocument,
  completeConsoleDocument,
  convertConsoleDocument,
  editConsoleLimit,
  editConsoleOrderBy,
  reflectSelectionLanguageEntity,
  parseConsoleDocument,
  type ConsoleDialect,
  type ConsoleLanguageApplicationReflection,
} from '../index.js';

const Chapter = entity('Chapter', {
  id: field.id(),
  partId: field.string(),
  title: field.string(),
  active: field.boolean(),
});
const Part = entity('Part', {
  id: field.id(),
  bookId: field.string(),
  kind: field.enum(['part', 'other']),
}).hasMany('children', Chapter, { via: 'partId' });
const Parts = withContextualSelections(Part, ({ self }) => ({
  chapters: self.children.where(c => c.active.eq(true)),
}));
const Book = withSelectionFactories(
  withContextualSelections(
    entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).hasMany('nodes', Parts, { via: 'bookId' }),
    ({ self }) => ({
      parts: self.nodes.where(p => p.kind.eq('part')),
    }),
  ),
  {
    slug: {
      version: 1,
      input: graphSchema.object({ slug: field.string() }),
      scalarInput: 'slug',
      template: { kind: 'predicate', fieldName: 'slug', operator: 'eq', input: 'slug' },
    },
  },
);
const application: ConsoleLanguageApplicationReflection = JSON.parse(
  JSON.stringify({
    entities: [Book, Parts, Chapter].map(reflectSelectionLanguageEntity),
  }),
);
const sources = {
  ts: 'Book.by({ slug: "my-book" }).parts.chapters.where(title = "Intro").many()',
  declarative: 'Book by slug "my-book" through parts through chapters where title = "Intro" many',
};

describe('contextual Console navigation', () => {
  it.each(['version', 'source', 'target', 'relation', 'missing-entity'] as const)(
    'does not offer or execute incompatible contextual reflection: %s',
    mismatch => {
      const model = structuredClone(application);
      const descriptor = model.entities[0]!.contextualSelections!.parts!;
      if (mismatch === 'version') descriptor.version = 99;
      if (mismatch === 'source') descriptor.input.context.entityName = 'Other';
      if (mismatch === 'target')
        descriptor.template.target = { ...descriptor.template.target, entityName: 'Other' };
      if (mismatch === 'relation') descriptor.template.relationName = 'unknown';
      const invalid = mismatch === 'missing-entity' ? { entities: [model.entities[0]!] } : model;
      expect(analyzeConsoleDocument('Book.parts.many()', invalid).request).toBeUndefined();
      expect(
        completeConsoleDocument('Book.', 5, invalid).items.map(item => item.label),
      ).not.toContain('parts');
    },
  );
  it('preserves BookOps-style classification filters across a self-relation, without variant Entities', () => {
    const Node = entity('ContentNode', {
      id: field.id(),
      bookId: field.string(),
      parentId: field.nullable(field.string()),
      type: field.enum(['part', 'chapter']),
    });
    const Nodes = withContextualSelections(
      Node.hasMany('children', Node, { via: 'parentId' }),
      ({ self }) => ({ chapters: self.children.where(node => node.type.eq('chapter')) }),
    );
    const Books = withContextualSelections(
      entity('Book', { id: field.id() }).hasMany('contentNodes', Nodes, { via: 'bookId' }),
      ({ self }) => ({ parts: self.contentNodes.where(node => node.type.eq('part')) }),
    );
    const model = { entities: [Books, Nodes].map(reflectSelectionLanguageEntity) };
    const expected = Selection.all(Books).parts.chapters.toAst();
    for (const [dialect, source] of [
      ['ts', 'Book.parts.chapters.many()'],
      ['declarative', 'Book through parts through chapters many'],
    ] as const)
      expect(analyzeConsoleDocument(source, model, { dialect }).request?.selection).toEqual(
        expected,
      );
    expect(expected.entityName).toBe('ContentNode');
  });

  it.each(['many', 'one', 'first', 'count', 'exists'])(
    'retains target cardinality intent for %s',
    terminal => {
      const ts = analyzeConsoleDocument(`Book.parts.chapters.${terminal}()`, application);
      const declarative = analyzeConsoleDocument(
        `Book through parts through chapters ${terminal}`,
        application,
        { dialect: 'declarative' },
      );
      expect(ts.request).toBeDefined();
      expect(ts.request).toEqual(declarative.request);
      expect(ts.syntax.expression?.terminal?.text).toBe(terminal);
    },
  );
  it.each(['ts', 'declarative'] as const)(
    'compiles %s to canonical deferred membership and preserves edits',
    dialect => {
      const source = sources[dialect];
      const analysis = analyzeConsoleDocument(source, application, { dialect });
      expect(analysis.syntaxDiagnostics).toEqual([]);
      expect(analysis.semanticDiagnostics).toEqual([]);
      expect(analysis.request).toMatchObject({
        version: 2,
        mode: 'run',
        selection: Book.by({ slug: 'my-book' })
          .parts.chapters.and(c => c.title.eq('Intro'))
          .toAst(),
      });
      const other = dialect === 'ts' ? 'declarative' : 'ts';
      expect(convertConsoleDocument(source, application, other, { dialect })).toBe(sources[other]);
      for (const changes of [
        editConsoleLimit(source, application, 10, { dialect }),
        editConsoleOrderBy(
          source,
          application,
          { fieldName: 'title', direction: 'desc' },
          { dialect },
        ),
      ]) {
        expect(changes).toBeDefined();
        const edited = [...changes!]
          .reverse()
          .reduce(
            (text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to),
            source,
          );
        expect(analyzeConsoleDocument(edited, application, { dialect }).request?.selection).toEqual(
          analysis.request?.selection,
        );
      }
      // Modifiers inserted after navigation even without a where clause.
      const bare =
        dialect === 'ts'
          ? 'Book.parts.chapters.many()'
          : 'Book through parts through chapters many';
      for (const changes of [
        editConsoleLimit(bare, application, 5, { dialect }),
        editConsoleOrderBy(
          bare,
          application,
          { fieldName: 'title', direction: 'asc' },
          { dialect },
        ),
      ]) {
        const edited = [...changes!]
          .reverse()
          .reduce(
            (text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to),
            bare,
          );
        expect(analyzeConsoleDocument(edited, application, { dialect }).request?.selection).toEqual(
          analyzeConsoleDocument(bare, application, { dialect }).request?.selection,
        );
      }
    },
  );

  const completions = (
    source: string,
    dialect: ConsoleDialect,
    orderableFields?: (name: string) => readonly string[],
  ) => {
    const position = source.indexOf('|');
    return completeConsoleDocument(source.replace('|', ''), position, application, {
      dialect,
      orderableFields,
    });
  };
  it.each([
    ['ts', 'Book.|', 'parts'],
    ['declarative', 'Book through |', 'parts'],
    ['ts', 'Book.parts.ch|', 'chapters'],
    ['declarative', 'Book through parts through ch|', 'chapters'],
    ['ts', 'Book.parts.ch|.many()', 'chapters'],
    ['declarative', 'Book through parts through ch| many', 'chapters'],
  ] as const)('shares contextual suggestions for %s %s', (dialect, source, expected) => {
    expect(completions(source, dialect).items.map(item => item.label)).toContain(expected);
  });
  it.each([
    ['ts', 'Book.parts.chapters.where(|)'],
    ['declarative', 'Book through parts through chapters where |'],
  ] as const)('completes target Fields for %s', (dialect, source) => {
    const labels = completions(source, dialect).items.map(item => item.label);
    expect(labels).toContain('active');
    expect(labels).not.toContain('slug');
  });
  it.each([
    ['ts', 'Book.parts.chapters.orderBy(|)'],
    ['declarative', 'Book through parts through chapters order by |'],
  ] as const)('uses target permissions for %s ordering', (dialect, source) => {
    const names: string[] = [];
    const result = completions(source, dialect, name => {
      names.push(name);
      return ['title'];
    });
    expect(names).toEqual(['Chapter']);
    expect(result.items.map(item => item.label)).toEqual(['title']);
  });
  it.each(['ts', 'declarative'] as const)(
    'recovers all %s prefixes without exceptions or fallback reads',
    dialect => {
      const source = sources[dialect];
      for (let end = 0; end <= source.length; end++) {
        const draft = source.slice(0, end);
        expect(() => parseConsoleDocument(draft, dialect)).not.toThrow();
        expect(() => completeConsoleDocument(draft, end, application, { dialect })).not.toThrow();
      }
      const invalid = dialect === 'ts' ? 'Book.unknown.many()' : 'Book through unknown many';
      const result = analyzeConsoleDocument(invalid, application, { dialect });
      expect(result.request).toBeUndefined();
      expect(result.semanticDiagnostics[0]?.code).toBe('console.semantic.invalid-navigation');
      expect(
        completions(dialect === 'ts' ? 'Book.unknown.|' : 'Book through unknown |', dialect).items,
      ).toEqual([]);
    },
  );
});
