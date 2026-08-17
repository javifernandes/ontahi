import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  createClientEntitySchemaModuleModel,
  printClientEntitySchemaModule,
  renderSemanticClientEntitySchemaModule,
} from '../src/generated-module/client-entity-schema.mjs';
import { renderGeneratedClientEntityModule } from '../src/projections.mjs';

import { importGeneratedModule } from './support/generated-module.js';

const summarizeExpression = expression => {
  if (ts.isIdentifier(expression)) {
    return { kind: 'identifier', name: expression.text };
  }
  if (ts.isStringLiteral(expression)) {
    return { kind: 'string', value: expression.text };
  }
  if (ts.isNumericLiteral(expression)) {
    return { kind: 'number', value: expression.text };
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return {
      kind: 'property-access',
      expression: summarizeExpression(expression.expression),
      name: expression.name.text,
    };
  }
  if (ts.isCallExpression(expression)) {
    return {
      kind: 'call',
      expression: summarizeExpression(expression.expression),
      arguments: expression.arguments.map(summarizeExpression),
    };
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return {
      kind: 'object',
      properties: expression.properties.map(property => ({
        name: property.name.text,
        value: summarizeExpression(property.initializer),
      })),
    };
  }

  throw new Error(`Unsupported test expression: ${ts.SyntaxKind[expression.kind]}`);
};

const summarizeSchemaModule = source => {
  const sourceFile = ts.createSourceFile(
    'client-entities.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const coreImport = sourceFile.statements.find(
    statement =>
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === '@ontahi/core/data-graph',
  );
  const schemaDeclaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .find(statement =>
      statement.declarationList.declarations.some(
        declaration => declaration.name.getText(sourceFile) === 'NoteSchema',
      ),
    );
  const declaration = schemaDeclaration.declarationList.declarations[0];

  return {
    coreImports: coreImport.importClause.namedBindings.elements
      .filter(element => ['entity', 'field'].includes(element.propertyName?.text ?? element.name.text))
      .map(element => ({
        importedName: element.propertyName?.text ?? element.name.text,
        localName: element.name.text,
      })),
    schema: {
      exported: schemaDeclaration.modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ),
      localName: declaration.name.getText(sourceFile),
      expression: summarizeExpression(declaration.initializer),
    },
    diagnostics: sourceFile.parseDiagnostics,
  };
};

const noteEntity = {
  entityName: 'Note',
  entityDefinitionName: 'Note',
  entityDefinitionLocalName: 'NoteSchema',
  entitySchemaProjection: {
    name: 'Note',
    fieldsText: '{ id: field.id(), title: field.string(), updatedAt: field.string() }',
    displayText: "{ primary: 'title' }",
    freshnessText: "{ updatedAt: 'updatedAt' }",
    locatorsText: "{ byId: 'id' }",
    identityText: "'byId'",
  },
  helperTexts: [],
  operations: [],
};

describe('semantic client Entity schema emitter', () => {
  it('models the core imports and a relation-free Entity schema projection', () => {
    expect(createClientEntitySchemaModuleModel({ schemaEntities: [noteEntity] })).toEqual({
      diagnostics: [],
      model: {
        kind: 'client-entity-schema-module',
        coreImports: [
          { importedName: 'entity', localName: 'defineEntitySchema' },
          { importedName: 'field', localName: 'field' },
        ],
        entitySchemas: [
          {
            localName: 'NoteSchema',
            entityName: 'Note',
            fields: {
              kind: 'source-expression',
              sourceText:
                '{ id: field.id(), title: field.string(), updatedAt: field.string() }',
            },
            display: {
              kind: 'source-expression',
              sourceText: "{ primary: 'title' }",
            },
            freshness: {
              kind: 'source-expression',
              sourceText: "{ updatedAt: 'updatedAt' }",
            },
            locators: {
              kind: 'source-expression',
              sourceText: "{ byId: 'id' }",
            },
            identity: { kind: 'source-expression', sourceText: "'byId'" },
          },
        ],
      },
    });
  });

  it('prints a deterministic schema AST with semantic parity to the legacy projection', () => {
    const semanticSource = renderSemanticClientEntitySchemaModule({
      schemaEntities: [noteEntity],
    });
    const legacySource = renderGeneratedClientEntityModule({ entities: [noteEntity] });

    expect(summarizeSchemaModule(semanticSource)).toEqual(summarizeSchemaModule(legacySource));
    expect(summarizeSchemaModule(semanticSource).diagnostics).toEqual([]);
    expect(renderSemanticClientEntitySchemaModule({ schemaEntities: [noteEntity] })).toBe(
      semanticSource,
    );
  });

  it('typechecks and evaluates the generated schema against the real data-graph runtime', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-client-schema-emitter-'));

    try {
      const generated = await importGeneratedModule({
        directory,
        source: renderSemanticClientEntitySchemaModule({ schemaEntities: [noteEntity] }),
      });

      expect(generated.NoteSchema).toMatchObject({
        kind: 'entity',
        name: 'Note',
        fields: {
          id: { kind: 'field' },
          title: { kind: 'field' },
          updatedAt: { kind: 'field' },
        },
        displayMetadata: { primary: 'title' },
        freshnessMetadata: { updatedAt: 'updatedAt' },
        identityLocatorName: 'byId',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects projection dependencies that are not in the base-schema model yet', () => {
    const result = createClientEntitySchemaModuleModel({
      schemaEntities: [
        {
          ...noteEntity,
          entitySchemaProjection: {
            ...noteEntity.entitySchemaProjection,
            referenceFields: [{ targetName: 'AuthorEntity' }],
            relations: [{ kind: 'belongsTo', name: 'author', targetName: 'AuthorEntity' }],
          },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      {
        entityName: 'Note',
        expression: 'referenceFields',
        message: 'Reference fields are not supported by the base schema emitter.',
      },
      {
        entityName: 'Note',
        expression: 'relations',
        message: 'Entity relations are not supported by the base schema emitter.',
      },
    ]);
    expect(() =>
      renderSemanticClientEntitySchemaModule({
        schemaEntities: [
          {
            ...noteEntity,
            entitySchemaProjection: {
              ...noteEntity.entitySchemaProjection,
              relations: [{ kind: 'belongsTo', name: 'author', targetName: 'AuthorEntity' }],
            },
          },
        ],
      }),
    ).toThrow(/Note\.relations: Entity relations are not supported/);
  });

  it('omits unused field imports and reports malformed source-expression boundaries', () => {
    const emptyResult = createClientEntitySchemaModuleModel({
      schemaEntities: [
        {
          entityName: 'Empty',
          entitySchemaProjection: { name: 'Empty', fieldsText: '{}' },
        },
      ],
    });

    expect(emptyResult).toEqual({
      diagnostics: [],
      model: {
        kind: 'client-entity-schema-module',
        coreImports: [{ importedName: 'entity', localName: 'defineEntitySchema' }],
        entitySchemas: [
          {
            localName: 'EmptySchema',
            entityName: 'Empty',
            fields: { kind: 'source-expression', sourceText: '{}' },
            display: undefined,
            freshness: undefined,
            locators: undefined,
            identity: undefined,
          },
        ],
      },
    });

    const malformedEntity = {
      entityName: 'Broken',
      entitySchemaProjection: { name: 'Broken', fieldsText: '{ id: field.id( }' },
    };
    const malformedResult = createClientEntitySchemaModuleModel({
      schemaEntities: [malformedEntity],
    });

    expect(malformedResult.diagnostics).toEqual([
      expect.objectContaining({ entityName: 'Broken', expression: 'fields' }),
    ]);
    expect(() =>
      renderSemanticClientEntitySchemaModule({ schemaEntities: [malformedEntity] }),
    ).toThrow(/Broken\.fields/);
    expect(() => printClientEntitySchemaModule(malformedResult.model)).toThrow(
      /Cannot emit an invalid client Entity schema expression/,
    );
  });
});
