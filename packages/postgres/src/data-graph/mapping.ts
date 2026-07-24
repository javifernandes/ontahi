import type { AnyEntityDefinition } from '@ontahi/core/data-graph';

export type PostgresEntityMapping<TEntity extends AnyEntityDefinition = AnyEntityDefinition> = {
  entity: TEntity;
  table: string;
  columns: { [TField in keyof TEntity['fields'] & string]: string };
};

export const postgresMapping = <TEntity extends AnyEntityDefinition>(
  mapping: PostgresEntityMapping<TEntity>,
) => mapping;

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
