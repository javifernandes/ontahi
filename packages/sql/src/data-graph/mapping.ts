import {
  applyConventionalDataGraphMappings,
  getEntityMapping,
  isDerivedFieldDefinition,
  type AnyEntityDefinition,
  type DataGraphMappingNaming,
  type DataGraphMappingOverrides,
} from '@ontahi/core/data-graph';

export type SqlEntityMapping<TEntity extends AnyEntityDefinition = AnyEntityDefinition> = {
  entity: TEntity;
  table: string;
  columns: {
    [TField in keyof TEntity['fields'] & string as TEntity['fields'][TField] extends {
      derived: object;
    }
      ? never
      : TField]: string;
  };
};

export const sqlMapping = <TEntity extends AnyEntityDefinition>(
  mapping: SqlEntityMapping<TEntity>,
) => mapping;

export type SqlDataGraphNaming = DataGraphMappingNaming;
export type SqlDataGraphMappingOverrides = DataGraphMappingOverrides;

const snakeCase = (value: string) =>
  value
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replaceAll(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

const pluralize = (value: string) => {
  if (value.endsWith('s')) return value;
  if (value.endsWith('y') && !/[aeiou]y$/.test(value)) return `${value.slice(0, -1)}ies`;
  return `${value}s`;
};

export const sqlNaming = {
  snakeCase: (): SqlDataGraphNaming => ({
    table: entityName => pluralize(snakeCase(entityName)),
    column: snakeCase,
  }),
};

export const inferSqlMappings = (
  entities: readonly AnyEntityDefinition[],
  options: {
    naming?: SqlDataGraphNaming;
    overrides?: SqlDataGraphMappingOverrides;
  } = {},
): SqlEntityMapping[] => {
  const naming = options.naming ?? sqlNaming.snakeCase();
  applyConventionalDataGraphMappings({
    entities,
    naming,
    overrides: options.overrides,
  });

  return entities.map(entity => {
    const mapping = getEntityMapping(entity);
    return {
      entity,
      table: mapping.tableName,
      columns: mapping.columns,
    };
  });
};

export const createSqlMappingRegistry = (
  mappings: readonly SqlEntityMapping[],
): Map<AnyEntityDefinition, SqlEntityMapping> => {
  const registry = new Map<AnyEntityDefinition, SqlEntityMapping>();

  for (const mapping of mappings) {
    const fields = Object.entries(mapping.entity.fields)
      .filter(([, field]) => !isDerivedFieldDefinition(field))
      .map(([field]) => field);
    const mappedFields = Object.keys(mapping.columns);
    const missing = fields.filter(field => !mappedFields.includes(field));
    const unknown = mappedFields.filter(field => !fields.includes(field));

    if (missing.length > 0 || unknown.length > 0) {
      const details = [];
      if (missing.length) details.push(`missing fields ${missing.join(', ')}`);
      if (unknown.length) details.push(`unknown fields ${unknown.join(', ')}`);
      throw new Error(`Invalid SQL mapping for ${mapping.entity.name}: ${details.join(' ')}`);
    }

    if (new Set(Object.values(mapping.columns)).size !== mappedFields.length) {
      throw new Error(`Invalid SQL mapping for ${mapping.entity.name}: duplicate columns`);
    }

    registry.set(mapping.entity, mapping);
  }

  return registry;
};
