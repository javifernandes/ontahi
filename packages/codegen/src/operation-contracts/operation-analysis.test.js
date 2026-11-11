import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { parseOperationDefinition } from './operation-analysis.mjs';
import { createSchemaContext } from './source-resolution.mjs';

const operationPropertyFrom = sourceText => {
  const sourceFile = ts.createSourceFile(
    '/virtual/operations.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const statement = sourceFile.statements[0];
  const declaration = statement.declarationList.declarations[0];
  return declaration.initializer.properties[0];
};

const parseReceiverOperation = sourceText =>
  parseOperationDefinition(
    operationPropertyFrom(sourceText),
    new Map(),
    new Map(),
    { authority: 'server', exposure: 'bridge' },
    undefined,
    { entityName: 'Book' },
  );

const parseReceiverOperationWithContext = (sourceText, entityName = 'Book') => {
  const sourceFile = ts.createSourceFile(
    '/virtual/operations.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const schemaContext = createSchemaContext({ sourceFile, sourcePath: sourceFile.fileName });
  const operations = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(
      declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'operations',
    );
  return parseOperationDefinition(
    operations.initializer.properties[0],
    schemaContext.declarations,
    schemaContext.importMap,
    { authority: 'server', exposure: 'bridge' },
    schemaContext,
    { entityName },
  );
};

describe('Operation declaration analysis', () => {
  it('derives portable input and Entity-type receiver metadata', () => {
    expect(
      parseReceiverOperation(`
        const operations = {
          rename: operation({
            receiver: { kind: 'input', path: 'book' },
            input: graphSchema.object({ book: graphSchema.existingRef(self) }),
            run: () => undefined,
          }),
        };
      `),
    ).toMatchObject({
      receiver: {
        kind: 'input',
        path: 'book',
        entityName: 'Book',
        participant: 'ref',
        requirement: 'existing',
        source: 'declaration',
      },
      diagnostics: [],
    });
    expect(
      parseReceiverOperation(`
        const operations = {
          create: operation({
            receiver: { kind: 'entity-type', entity: self },
            run: () => undefined,
          }),
        };
      `),
    ).toMatchObject({
      receiver: { kind: 'entity-type', entityName: 'Book', source: 'declaration' },
      diagnostics: [],
    });
    expect(
      parseReceiverOperationWithContext(`
        const Author = entity({ name: 'Author', fields: {} });
        const operations = {
          create: operation({
            receiver: { kind: 'entity-type', entity: Author },
            run: () => undefined,
          }),
        };
      `),
    ).toMatchObject({
      receiver: { kind: 'entity-type', entityName: 'Author', source: 'declaration' },
      diagnostics: [],
    });
  });

  it.each([
    ['receiver must be an object literal', 'receiver: receiverConfig'],
    ['receiver.kind must be a string literal', 'receiver: { kind: receiverKind }'],
    ['receiver.path must be a string literal', "receiver: { kind: 'input', path: receiverPath }"],
    [
      'receiver.entity must reference an Entity identifier',
      "receiver: { kind: 'entity-type', entity: entity() }",
    ],
    [
      'receiver.kind must be "input" or "entity-type"',
      "receiver: { kind: 'selection', path: 'books' }",
    ],
  ])('reports %s', (message, receiver) => {
    expect(
      parseReceiverOperation(`
        const operations = {
          inspect: operation({ ${receiver}, run: () => undefined }),
        };
      `),
    ).toEqual({ diagnostics: [`inspect.${message}.`] });
  });

  it('rejects an input receiver that codegen cannot derive from the input contract', () => {
    expect(
      parseReceiverOperation(`
        const operations = {
          inspect: operation({
            receiver: { kind: 'input', path: 'book' },
            input: graphSchema.object({ book: graphSchema.string() }),
            run: () => undefined,
          }),
        };
      `),
    ).toEqual({
      diagnostics: [
        'inspect.receiver path must identify an inline graphSchema.ref or graphSchema.existingRef input.',
      ],
    });
  });

  it.each(['optional', 'nullable'])('rejects a receiver wrapped in graphSchema.%s', wrapper => {
    expect(
      parseReceiverOperation(`
          const operations = {
            inspect: operation({
              receiver: { kind: 'input', path: 'book' },
              input: graphSchema.object({
                book: graphSchema.${wrapper}(graphSchema.existingRef(self)),
              }),
              run: () => undefined,
            }),
          };
        `),
    ).toEqual({
      diagnostics: [
        'inspect.receiver path must identify an inline graphSchema.ref or graphSchema.existingRef input.',
      ],
    });
  });

  it('derives a receiver retained by graphSchema.pick', () => {
    expect(
      parseReceiverOperationWithContext(`
        const Author = entity({ name: 'Author', fields: { id: field.id() } });
        const Book = entity({
          name: 'Book',
          fields: { id: field.id(), author: graphSchema.existingRef(Author) },
        });
        const operations = {
          inspect: operation({
            receiver: { kind: 'input', path: 'author' },
            input: graphSchema.pick(self, ['author']).named('InspectInput'),
            run: () => undefined,
          }),
        };
      `),
    ).toMatchObject({
      receiver: {
        kind: 'input',
        path: 'author',
        entityName: 'Author',
        requirement: 'existing',
      },
      diagnostics: [],
    });
  });

  it('derives a receiver from an explicitly named Entity picked input', () => {
    expect(
      parseReceiverOperationWithContext(`
        const Author = entity({ name: 'Author', fields: { id: field.id() } });
        const Book = entity({
          name: 'Book',
          fields: { id: field.id(), author: graphSchema.ref(Author) },
        });
        const operations = {
          inspect: operation({
            receiver: { kind: 'input', path: 'author' },
            input: graphSchema.pick(Book, ['author']).named('InspectInput'),
            run: () => undefined,
          }),
        };
      `),
    ).toMatchObject({
      receiver: {
        kind: 'input',
        path: 'author',
        entityName: 'Author',
        requirement: 'portable',
      },
      diagnostics: [],
    });
  });

  it.each([
    ["graphSchema.pick(Book, ['id']).named('InspectInput')", 'receiver field is not selected'],
    ["graphSchema.pick(Book, selected).named('InspectInput')", 'pick keys are not literal'],
    ['graphSchema.array(graphSchema.existingRef(Book))', 'input is not object-shaped'],
    [
      "graphSchema.pick(graphSchema.string(), ['author']).named('InspectInput')",
      'source has no fields',
    ],
  ])('rejects a picked receiver when %s', (input, _reason) => {
    expect(
      parseReceiverOperationWithContext(`
        const Book = entity({
          name: 'Book',
          fields: { id: field.id(), author: graphSchema.ref(self) },
        });
        const selected = ['author'];
        const operations = {
          inspect: operation({
            receiver: { kind: 'input', path: 'author' },
            input: ${input},
            run: () => undefined,
          }),
        };
      `),
    ).toEqual({
      diagnostics: [
        'inspect.receiver path must identify an inline graphSchema.ref or graphSchema.existingRef input.',
      ],
    });
  });

  it('resolves an imported Entity alias in an imported Value receiver', () => {
    const operationSource = `
      import { InspectInput } from './input';
      const operations = {
        inspect: operation({
          receiver: { kind: 'input', path: 'author' },
          input: InspectInput,
          run: () => undefined,
        }),
      };
    `;
    const sourceFile = ts.createSourceFile(
      '/virtual/operations.ts',
      operationSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const sources = new Map([
      [
        './input',
        {
          sourcePath: '/virtual/input.ts',
          sourceText: `
            import { Author as Writer } from './author';
            export const InspectInput = value('InspectInput', {
              author: graphSchema.existingRef(Writer),
            });
          `,
        },
      ],
      [
        './author',
        {
          sourcePath: '/virtual/author.ts',
          sourceText: `export const Author = entity({ name: 'Author', fields: {} });`,
        },
      ],
    ]);
    const schemaContext = createSchemaContext({
      sourceFile,
      sourcePath: sourceFile.fileName,
      resolveImportSource: (_sourcePath, importPath) => sources.get(importPath),
    });
    const operations = schemaContext.declarations.get('operations');

    expect(
      parseOperationDefinition(
        operations.initializer.properties[0],
        schemaContext.declarations,
        schemaContext.importMap,
        { authority: 'server', exposure: 'bridge' },
        schemaContext,
        { entityName: 'Book' },
      ),
    ).toMatchObject({
      receiver: { entityName: 'Author', path: 'author' },
      diagnostics: [],
    });
  });

  it('rejects shorthand postconditions instead of silently dropping them', () => {
    const property = operationPropertyFrom(`
      const operations = {
        inspect: operation({
          contracts: { post },
          run: () => undefined,
        }),
      };
    `);

    expect(
      parseOperationDefinition(property, new Map(), new Map(), {
        authority: 'server',
        exposure: 'bridge',
      }),
    ).toEqual({
      diagnostics: [
        'inspect.contracts.post is not portable in this slice; use contract(...) for an opaque server-only check.',
      ],
    });
  });

  it('reports a diagnostic when portable conditions have no source context', () => {
    const property = operationPropertyFrom(`
      const operations = {
        inspect: operation({
          contracts: { pre: { ready: () => true } },
          run: () => undefined,
        }),
      };
    `);

    expect(
      parseOperationDefinition(property, new Map(), new Map(), {
        authority: 'server',
        exposure: 'bridge',
      }),
    ).toEqual({
      diagnostics: [
        'inspect.contracts.pre cannot be compiled without its TypeScript source context.',
      ],
    });
  });
});
