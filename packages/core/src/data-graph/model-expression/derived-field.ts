import {
  isDerivedFieldDefinition,
  type AnyEntityDefinition,
  type DerivedFieldDefinition,
} from '../definitions.js';

import {
  assertModelExpressionProgram,
  collectModelExpressionDependencies,
  type ModelExpressionProgram,
} from './program.js';

export type PortableDerivedFieldRegistryDeclaration = {
  version: 1;
  entities: Record<
    string,
    {
      fields: Record<string, ModelExpressionProgram>;
    }
  >;
};

export type PortableDerivedFieldRegistry = PortableDerivedFieldRegistryDeclaration;

export const definePortableDerivedFieldRegistry = (
  declaration: PortableDerivedFieldRegistryDeclaration,
): PortableDerivedFieldRegistry => {
  if (declaration.version !== 1) {
    throw new TypeError(
      `Unsupported portable derived Field registry version ${String(declaration.version)}.`,
    );
  }

  for (const [entityName, entity] of Object.entries(declaration.entities)) {
    if (!entityName) throw new TypeError('Portable derived Field Entity names cannot be empty.');
    for (const [fieldName, expression] of Object.entries(entity.fields)) {
      if (!fieldName) {
        throw new TypeError(`Portable derived Field name cannot be empty on ${entityName}.`);
      }
      assertModelExpressionProgram(expression);
    }
  }

  return declaration;
};

const assertDerivedFieldDependencies = (
  entity: AnyEntityDefinition,
  fieldName: string,
  field: DerivedFieldDefinition<unknown>,
) => {
  for (const dependency of field.derived.dependencies ?? []) {
    if (dependency.kind === 'input-ref') {
      throw new TypeError(
        `Derived Field ${entity.name}.${fieldName} cannot depend on Operation input ${dependency.input}.`,
      );
    }
    if (dependency.kind === 'field') {
      const dependencyField = entity.fields[dependency.field];
      if (!dependencyField || isDerivedFieldDefinition(dependencyField)) {
        throw new TypeError(
          `Derived Field ${entity.name}.${fieldName} requires stored Field ${dependency.field}.`,
        );
      }
      continue;
    }

    const relation = entity.relations[dependency.relation];
    if (!relation || relation.relationKind === 'belongsTo') {
      throw new TypeError(
        `Derived Field ${entity.name}.${fieldName} requires to-many Relation ${dependency.relation}.`,
      );
    }
  }
};

export const materializeDerivedFieldDefinitions = (
  entities: readonly AnyEntityDefinition[],
  registry?: PortableDerivedFieldRegistry,
) => {
  const entitiesByName = new Map(entities.map(entity => [entity.name, entity]));

  for (const [entityName, declaration] of Object.entries(registry?.entities ?? {})) {
    const entity = entitiesByName.get(entityName);
    if (!entity) throw new TypeError(`Unknown derived Field Entity ${entityName}.`);
    for (const fieldName of Object.keys(declaration.fields)) {
      const field = entity.fields[fieldName];
      if (!field || !isDerivedFieldDefinition(field)) {
        throw new TypeError(`Unknown derived Field ${entityName}.${fieldName}.`);
      }
    }
  }

  for (const entity of entities) {
    for (const [fieldName, field] of Object.entries(entity.fields)) {
      if (!isDerivedFieldDefinition(field)) continue;
      const generated = registry?.entities[entity.name]?.fields[fieldName];
      const expression = field.derived.expression ?? generated;
      if (!expression) {
        throw new TypeError(
          `Derived Field ${entity.name}.${fieldName} has no compiled Model Expression. Run Ontahi codegen or use modelExpression.define(...).`,
        );
      }
      assertModelExpressionProgram(expression);
      field.derived = {
        expression,
        dependencies: collectModelExpressionDependencies(expression),
      };
      assertDerivedFieldDependencies(entity, fieldName, field);
    }
  }
};
