import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { parseOperationDefinition } from './operation-analysis.mjs';

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
