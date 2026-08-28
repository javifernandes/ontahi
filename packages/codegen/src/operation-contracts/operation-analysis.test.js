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

describe('Operation declaration analysis', () => {
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
