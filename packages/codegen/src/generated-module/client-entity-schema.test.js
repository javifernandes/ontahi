import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { importGeneratedModule } from '../../test/support/generated-module.js';
import { renderGeneratedClientEntityModule } from '../projections.mjs';

import {
  createClientEntitySchemaModuleModel,
  printClientEntitySchemaImports,
  printClientEntitySchemaStatements,
  printClientEntitySchemaModule,
  renderSemanticClientEntitySchemaModule,
} from './client-entity-schema.mjs';

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
      .filter(element =>
        ['entity', 'field'].includes(element.propertyName?.text ?? element.name.text),
      )
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

const summarizeSchemaFamily = ({ source, localNames }) => {
  const sourceFile = ts.createSourceFile(
    'client-entities.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports = sourceFile.statements.filter(ts.isImportDeclaration).map(statement => ({
    moduleSpecifier: statement.moduleSpecifier.text,
    bindings: statement.importClause.namedBindings.elements
      .filter(
        element =>
          statement.moduleSpecifier.text !== '@ontahi/core/data-graph' ||
          ['entity', 'field'].includes(element.propertyName?.text ?? element.name.text),
      )
      .map(element => ({
        importedName: element.propertyName?.text ?? element.name.text,
        localName: element.name.text,
      })),
  }));
  const schemas = sourceFile.statements.filter(ts.isVariableStatement).flatMap(statement =>
    statement.declarationList.declarations
      .filter(declaration => localNames.includes(declaration.name.getText(sourceFile)))
      .map(declaration => ({
        localName: declaration.name.getText(sourceFile),
        expression: summarizeExpression(declaration.initializer),
      })),
  );
  const deferredRelations = sourceFile.statements
    .filter(ts.isExpressionStatement)
    .map(statement => statement.expression)
    .filter(
      expression =>
        ts.isCallExpression(expression) &&
        ts.isPropertyAccessExpression(expression.expression) &&
        ts.isIdentifier(expression.expression.expression) &&
        localNames.includes(expression.expression.expression.text),
    )
    .map(summarizeExpression);

  return { imports, schemas, deferredRelations, diagnostics: sourceFile.parseDiagnostics };
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

const relatedSchemaEntities = [
  {
    entityName: 'Book',
    entityDefinitionName: 'BookEntity',
    entityDefinitionLocalName: 'BookSchema',
    entitySchemaProjection: {
      name: 'Book',
      fieldsText: '{ id: field.id(), author: field.ref(AuthorEntity) }',
      referenceFields: [{ name: 'author', targetName: 'AuthorEntity' }],
      relations: [
        {
          kind: 'hasMany',
          name: 'progress',
          targetName: 'ReadingProgressEntity',
          via: 'bookId',
        },
        {
          kind: 'belongsTo',
          name: 'publisher',
          targetName: 'PublisherEntity',
          deferred: true,
        },
      ],
    },
  },
  {
    entityName: 'ReadingProgress',
    entityDefinitionName: 'ReadingProgressEntity',
    entityDefinitionLocalName: 'ReadingProgressSchema',
    entitySchemaProjection: {
      name: 'ReadingProgress',
      fieldsText: '{ bookId: field.id() }',
    },
  },
  {
    entityName: 'Author',
    entityDefinitionName: 'AuthorEntity',
    entityDefinitionLocalName: 'AuthorSchema',
    entitySchemaProjection: { name: 'Author', fieldsText: '{ id: field.id() }' },
  },
  {
    entityName: 'Publisher',
    entityDefinitionName: 'PublisherEntity',
    entityDefinitionLocalName: 'PublisherSchema',
    entitySchemaProjection: { name: 'Publisher', fieldsText: '{ id: field.id() }' },
  },
];

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
        schemaImports: [],
        entitySchemas: [
          {
            localName: 'NoteSchema',
            entityName: 'Note',
            fields: {
              kind: 'source-expression',
              sourceText: '{ id: field.id(), title: field.string(), updatedAt: field.string() }',
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
            relations: [],
          },
        ],
        deferredRelations: [],
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

  it('models projected dependency order plus immediate and deferred relations', () => {
    expect(createClientEntitySchemaModuleModel({ schemaEntities: relatedSchemaEntities })).toEqual({
      diagnostics: [],
      model: {
        kind: 'client-entity-schema-module',
        coreImports: [
          { importedName: 'entity', localName: 'defineEntitySchema' },
          { importedName: 'field', localName: 'field' },
        ],
        schemaImports: [],
        entitySchemas: [
          expect.objectContaining({ localName: 'AuthorSchema', entityName: 'Author' }),
          expect.objectContaining({
            localName: 'ReadingProgressSchema',
            entityName: 'ReadingProgress',
          }),
          expect.objectContaining({
            localName: 'BookSchema',
            entityName: 'Book',
            fields: {
              kind: 'source-expression',
              sourceText: '{ id: field.id(), author: field.ref(AuthorSchema) }',
            },
            relations: [
              {
                kind: 'hasMany',
                name: 'progress',
                targetLocalName: 'ReadingProgressSchema',
                via: 'bookId',
              },
            ],
          }),
          expect.objectContaining({ localName: 'PublisherSchema', entityName: 'Publisher' }),
        ],
        deferredRelations: [
          {
            sourceLocalName: 'BookSchema',
            kind: 'belongsTo',
            name: 'publisher',
            targetLocalName: 'PublisherSchema',
            via: undefined,
          },
        ],
      },
    });
  });

  it('prints dependency order and relations with semantic parity to the legacy projection', () => {
    const semanticSource = renderSemanticClientEntitySchemaModule({
      schemaEntities: relatedSchemaEntities,
    });
    const legacySource = renderGeneratedClientEntityModule({
      entities: relatedSchemaEntities.map(entity => ({
        ...entity,
        helperTexts: [],
        operations: [],
      })),
      schemaEntities: relatedSchemaEntities,
    });
    const localNames = ['AuthorSchema', 'ReadingProgressSchema', 'BookSchema', 'PublisherSchema'];

    expect(summarizeSchemaFamily({ source: semanticSource, localNames })).toEqual(
      summarizeSchemaFamily({ source: legacySource, localNames }),
    );
    expect(summarizeSchemaFamily({ source: semanticSource, localNames }).diagnostics).toEqual([]);
  });

  it('typechecks and evaluates projected reference and relation targets', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-client-schema-relations-'));

    try {
      const generated = await importGeneratedModule({
        directory,
        source: renderSemanticClientEntitySchemaModule({
          schemaEntities: relatedSchemaEntities,
        }),
      });

      expect(generated.BookSchema.fields.author.target).toBe(generated.AuthorSchema);
      expect(generated.BookSchema.relations.progress).toMatchObject({
        relationKind: 'hasMany',
        target: generated.ReadingProgressSchema,
        targetField: 'bookId',
      });
      expect(generated.BookSchema.relations.publisher).toMatchObject({
        relationKind: 'belongsTo',
        target: generated.PublisherSchema,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('models deterministic imports for external schema dependencies', () => {
    const schemaEntities = [
      {
        entityName: 'Note',
        entityDefinitionName: 'NoteEntity',
        entityDefinitionLocalName: 'NoteSchema',
        entitySchemaProjection: {
          name: 'Note',
          fieldsText: '{ id: field.id(), owner: field.ref(UserEntity) }',
          referenceFields: [
            { name: 'owner', targetName: 'UserEntity', targetImportPath: './users.js' },
          ],
          relations: [
            {
              kind: 'belongsTo',
              name: 'audit',
              targetName: 'AuditEntity',
              targetImportPath: './audit.js',
            },
            {
              kind: 'hasMany',
              name: 'tags',
              targetName: 'TagEntity',
              deferred: true,
            },
          ],
        },
      },
    ];

    const result = createClientEntitySchemaModuleModel({
      schemaEntities,
      schemaImportPath: '../schema.js',
    });

    expect(result).toEqual({
      diagnostics: [],
      model: {
        kind: 'client-entity-schema-module',
        coreImports: [
          { importedName: 'entity', localName: 'defineEntitySchema' },
          { importedName: 'field', localName: 'field' },
        ],
        schemaImports: [
          {
            moduleSpecifier: '../schema.js',
            bindings: [{ importedName: 'TagEntity', localName: 'TagEntity' }],
          },
          {
            moduleSpecifier: './audit.js',
            bindings: [{ importedName: 'AuditEntity', localName: 'AuditEntity' }],
          },
          {
            moduleSpecifier: './users.js',
            bindings: [{ importedName: 'UserEntity', localName: 'UserEntity' }],
          },
        ],
        entitySchemas: [
          expect.objectContaining({
            localName: 'NoteSchema',
            relations: [
              {
                kind: 'belongsTo',
                name: 'audit',
                targetLocalName: 'AuditEntity',
                via: undefined,
              },
            ],
          }),
        ],
        deferredRelations: [
          {
            sourceLocalName: 'NoteSchema',
            kind: 'hasMany',
            name: 'tags',
            targetLocalName: 'TagEntity',
            via: undefined,
          },
        ],
      },
    });

    const semanticSource = renderSemanticClientEntitySchemaModule({
      schemaEntities,
      schemaImportPath: '../schema.js',
    });
    const legacySource = renderGeneratedClientEntityModule({
      entities: schemaEntities.map(entity => ({ ...entity, helperTexts: [], operations: [] })),
      schemaEntities,
      schemaImportPath: '../schema.js',
    });

    expect(summarizeSchemaFamily({ source: semanticSource, localNames: ['NoteSchema'] })).toEqual(
      summarizeSchemaFamily({ source: legacySource, localNames: ['NoteSchema'] }),
    );
  });

  it('keeps schema import paths configurable', () => {
    expect(
      createClientEntitySchemaModuleModel({
        schemaEntities: [
          {
            entityName: 'Note',
            entitySchemaProjection: {
              name: 'Note',
              fieldsText: '{ owner: field.ref(UserEntity) }',
              referenceFields: [{ name: 'owner', targetName: 'UserEntity' }],
            },
          },
        ],
        schemaImportPath: '../schema.js',
      }).model.schemaImports,
    ).toEqual([
      {
        moduleSpecifier: '../schema.js',
        bindings: [{ importedName: 'UserEntity', localName: 'UserEntity' }],
      },
    ]);
  });

  it('routes the public client schema family through the semantic printers', () => {
    const schemaEntities = [
      {
        entityName: 'Note',
        entityDefinitionName: 'NoteEntity',
        entityDefinitionLocalName: 'NoteSchema',
        entitySchemaProjection: {
          name: 'Note',
          fieldsText: '{ owner: field.ref(UserEntity) }',
          referenceFields: [
            { name: 'owner', targetName: 'UserEntity', targetImportPath: './users.js' },
          ],
        },
        helperTexts: [],
        operations: [],
      },
    ];
    const result = createClientEntitySchemaModuleModel({ schemaEntities });
    const publicSource = renderGeneratedClientEntityModule({ entities: schemaEntities });

    expect(publicSource).toContain(printClientEntitySchemaImports(result.model).trim());
    expect(publicSource).toContain(printClientEntitySchemaStatements(result.model).trim());
    expect(publicSource).toContain('from "./users.js";');
    expect(publicSource).toContain('defineEntitySchema("Note"');
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
        schemaImports: [],
        entitySchemas: [
          {
            localName: 'EmptySchema',
            entityName: 'Empty',
            fields: { kind: 'source-expression', sourceText: '{}' },
            display: undefined,
            freshness: undefined,
            locators: undefined,
            identity: undefined,
            relations: [],
          },
        ],
        deferredRelations: [],
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
