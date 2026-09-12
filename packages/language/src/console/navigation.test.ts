import {
  entity,
  field,
  graphSchema,
  Selection,
  toSelectionAst,
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

describe('ordered filter and navigation composition', () => {
  const pipeline = {
    ts: 'Book.by({ slug: "my-book" }).where(id = "b1").parts.where(kind = "part").chapters.where(active = true).where(title = "Intro").many()',
    declarative:
      'Book by slug "my-book" where id = "b1" through parts where kind = "part" through chapters where active = true where title = "Intro" many',
  } as const;

  it.each(['ts', 'declarative'] as const)('recovers every %s pipeline prefix', dialect => {
    for (let end = 0; end <= pipeline[dialect].length; end += 1) {
      const prefix = pipeline[dialect].slice(0, end);
      expect(() => parseConsoleDocument(prefix, dialect)).not.toThrow();
      expect(() => completeConsoleDocument(prefix, end, application, { dialect })).not.toThrow();
      const analysis = analyzeConsoleDocument(prefix, application, { dialect });
      if (analysis.syntaxDiagnostics.length || analysis.semanticDiagnostics.length)
        expect(analysis.request).toBeUndefined();
    }
  });

  it.each([
    ['ts', String.raw`Book.where(slug = "\q").parts.where(kind = "part").many()`],
    ['declarative', String.raw`Book where slug = "\q" through parts where kind = "part" many`],
  ] as const)('reports invalid string escaping in a %s source stage', (dialect, source) => {
    const analysis = analyzeConsoleDocument(source, application, { dialect });
    expect(analysis.request).toBeUndefined();
    expect(analysis.syntaxDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'selection.syntax.invalid',
        from: source.indexOf('"'),
        to: source.indexOf('"', source.indexOf('"') + 1) + 1,
      }),
    );
  });

  it.each(['ts', 'declarative'] as const)('lowers every %s filter at its own Entity', dialect => {
    const source = pipeline[dialect];
    const analysis = analyzeConsoleDocument(source, application, { dialect });
    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.request?.selection).toEqual(
      toSelectionAst(
        Book.by({ slug: 'my-book' })
          .where(book => book.id.eq('b1'))
          .parts.where(part => part.kind.eq('part'))
          .chapters.where(chapter => chapter.active.eq(true))
          .where(chapter => chapter.title.eq('Intro'))
          .build(),
      ),
    );
    expect(analysis.syntax.expression?.steps.map(step => step.kind)).toEqual([
      'factory',
      'filter',
      'navigation',
      'filter',
      'navigation',
      'filter',
      'filter',
    ]);
    const other = dialect === 'ts' ? 'declarative' : 'ts';
    const converted = convertConsoleDocument(source, application, other, { dialect })!;
    expect(converted).toBe(pipeline[other]);
    expect(analyzeConsoleDocument(converted, application, { dialect: other }).request).toEqual(
      analysis.request,
    );
  });

  it.each([
    ['ts', 'Book.where(slug = "my-book").parts.many()'],
    ['declarative', 'Book where slug = "my-book" through parts many'],
    ['ts', pipeline.ts],
    ['declarative', pipeline.declarative],
  ] as const)('edits final shaping without crossing stages: %s %s', (dialect, original) => {
    let source: string = original;
    const membership = analyzeConsoleDocument(source, application, { dialect }).request?.selection;
    expect(membership).toBeDefined();
    for (const changes of [
      editConsoleOrderBy(source, application, { fieldName: 'id', direction: 'desc' }, { dialect }),
    ]) {
      expect(changes).toBeDefined();
      for (const change of [...changes!].reverse())
        source = source.slice(0, change.from) + change.insert + source.slice(change.to);
    }
    const limit = editConsoleLimit(source, application, 2, { dialect });
    expect(limit).toBeDefined();
    for (const change of [...limit!].reverse())
      source = source.slice(0, change.from) + change.insert + source.slice(change.to);
    const read = analyzeConsoleDocument(source, application, { dialect }).request;
    expect(read?.selection).toEqual(membership);
    expect(read).toMatchObject({ orderBy: [{ fieldName: 'id', direction: 'desc' }], limit: 2 });
  });

  it.each([
    [
      'ts',
      'Book.where(|).parts.where(kind = "part").chapters.many()',
      ['id', 'slug'],
      ['active', 'kind'],
    ],
    [
      'ts',
      'Book.where(slug = "my-book").parts.where(|).chapters.many()',
      ['kind', 'bookId'],
      ['slug', 'active'],
    ],
    [
      'ts',
      'Book.where(slug = "my-book").parts.chapters.where(|).many()',
      ['active', 'title'],
      ['slug', 'kind'],
    ],
    [
      'declarative',
      'Book where | through parts where kind = "part" through chapters many',
      ['id', 'slug'],
      ['active', 'kind'],
    ],
    [
      'declarative',
      'Book where slug = "my-book" through parts where | through chapters many',
      ['kind', 'bookId'],
      ['slug', 'active'],
    ],
    [
      'declarative',
      'Book where slug = "my-book" through parts through chapters where | many',
      ['active', 'title'],
      ['slug', 'kind'],
    ],
  ] as const)('completes stage-specific Fields: %s %s', (dialect, marked, included, excluded) => {
    const pos = marked.indexOf('|');
    expect(pos).toBeGreaterThanOrEqual(0);
    const source = marked.slice(0, pos) + marked.slice(pos + 1);
    const labels = completeConsoleDocument(source, pos, application, { dialect }).items.map(
      item => item.label,
    );
    expect(labels).toEqual(expect.arrayContaining([...included]));
    excluded.forEach(field => expect(labels).not.toContain(field));
  });

  it.each([
    ['ts', 'Book.where(slug = "my-book").', 'parts'],
    ['declarative', 'Book where slug = "my-book" ', 'through parts'],
    ['ts', 'Book.parts.where(kind = "part").', 'chapters'],
    ['declarative', 'Book through parts where kind = "part" ', 'through chapters'],
  ] as const)('offers navigation after a %s filter', (dialect, source, candidate) => {
    expect(
      completeConsoleDocument(source, source.length, application, { dialect }).items.map(
        item => item.label,
      ),
    ).toContain(candidate);
  });

  it.each([
    ['ts', 'Book.where(active = true).parts.many()'],
    ['declarative', 'Book where active = true through parts many'],
    ['ts', 'Book.where(slug = ).parts.many()'],
    ['declarative', 'Book where slug = through parts many'],
    ['ts', 'Book.where(slug = "my-book").unknown.where(id = "p1").many()'],
    ['declarative', 'Book where slug = "my-book" through unknown where id = "p1" many'],
    ['ts', 'Book.where(slug = "my-book").one().parts.many()'],
    ['declarative', 'Book where slug = "my-book" one through parts many'],
    ['ts', 'Book.orderBy(id).parts.many()'],
    ['declarative', 'Book order by id through parts many'],
  ] as const)('never executes an invalid prefix: %s %s', (dialect, source) => {
    const analysis = analyzeConsoleDocument(source, application, { dialect });
    expect(analysis.request).toBeUndefined();
    expect([...analysis.syntaxDiagnostics, ...analysis.semanticDiagnostics].length).toBeGreaterThan(
      0,
    );
    expect(
      convertConsoleDocument(source, application, dialect === 'ts' ? 'declarative' : 'ts', {
        dialect,
      }),
    ).toBeUndefined();
  });
});

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
    expect(position).toBeGreaterThanOrEqual(0);
    const document = source.slice(0, position) + source.slice(position + 1);
    return completeConsoleDocument(document, position, application, {
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
