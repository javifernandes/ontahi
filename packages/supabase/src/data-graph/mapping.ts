import {
  applyConventionalDataGraphMappings,
  type AnyEntityDefinition,
  type DataGraphMappingNaming,
  type DataGraphMappingOverrides,
} from '@ontahi/core/data-graph';

export type SupabaseDataGraphNaming = DataGraphMappingNaming;
export type SupabaseDataGraphMappingOverrides = DataGraphMappingOverrides;

export type ApplySupabaseDataGraphMappingsOptions = {
  entities: readonly AnyEntityDefinition[];
  naming?: SupabaseDataGraphNaming;
  overrides?: SupabaseDataGraphMappingOverrides;
};

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

export const supabaseNaming = {
  snakeCase: (): SupabaseDataGraphNaming => ({
    table: entityName => pluralize(snakeCase(entityName)),
    column: snakeCase,
  }),
};

export const applySupabaseDataGraphMappings = ({
  entities,
  naming = supabaseNaming.snakeCase(),
  overrides = {},
}: ApplySupabaseDataGraphMappingsOptions) =>
  applyConventionalDataGraphMappings({ entities, naming, overrides });
