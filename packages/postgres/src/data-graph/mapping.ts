import {
  applyConventionalDataGraphMappings,
  getEntityMapping,
  type AnyEntityDefinition,
  type DataGraphMappingNaming,
  type DataGraphMappingOverrides,
} from '@ontahi/core/data-graph';

export type PostgresEntityMapping<TEntity extends AnyEntityDefinition = AnyEntityDefinition> = {
  entity: TEntity;
  table: string;
  columns: { [TField in keyof TEntity['fields'] & string]: string };
};

export const postgresMapping = <TEntity extends AnyEntityDefinition>(
  mapping: PostgresEntityMapping<TEntity>,
) => mapping;

export type PostgresDataGraphNaming = DataGraphMappingNaming;
export type PostgresDataGraphMappingOverrides = DataGraphMappingOverrides;

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

export const postgresNaming = {
  snakeCase: (): PostgresDataGraphNaming => ({
    table: entityName => pluralize(snakeCase(entityName)),
    column: snakeCase,
  }),
};

export const inferPostgresMappings = (
  entities: readonly AnyEntityDefinition[],
  options: {
    naming?: PostgresDataGraphNaming;
    overrides?: PostgresDataGraphMappingOverrides;
  } = {},
): PostgresEntityMapping[] => {
  const naming = options.naming ?? postgresNaming.snakeCase();
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

export const createPostgresMappingRegistry = (
  mappings: readonly PostgresEntityMapping[],
): Map<AnyEntityDefinition, PostgresEntityMapping> => {
  const registry = new Map<AnyEntityDefinition, PostgresEntityMapping>();

  for (const mapping of mappings) {
    const fields = Object.keys(mapping.entity.fields);
    const mappedFields = Object.keys(mapping.columns);
    const missing = fields.filter(field => !mappedFields.includes(field));
    const unknown = mappedFields.filter(field => !fields.includes(field));

    if (missing.length > 0 || unknown.length > 0) {
      throw new Error(
        `Invalid PostgreSQL mapping for ${mapping.entity.name}:` +
          `${missing.length > 0 ? ` missing fields ${missing.join(', ')}` : ''}` +
          `${unknown.length > 0 ? ` unknown fields ${unknown.join(', ')}` : ''}`,
      );
    }

    if (new Set(Object.values(mapping.columns)).size !== mappedFields.length) {
      throw new Error(`Invalid PostgreSQL mapping for ${mapping.entity.name}: duplicate columns`);
    }

    registry.set(mapping.entity, mapping);
  }

  return registry;
};
