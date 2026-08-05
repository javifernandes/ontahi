import type { DataGraphDefaultStorage } from '@ontahi/core/data-graph';
import type { Pool } from 'pg';

import {
  inferPostgresMappings,
  type PostgresDataGraphMappingOverrides,
  type PostgresDataGraphNaming,
  type PostgresEntityMapping,
} from './mapping.js';
import {
  createPostgresReflectedEntityDataReader,
  type PostgresReflectedEntityDataReaderOptions,
} from './reflected-entity-data.js';
import { createPostgresDataGraphRuntime } from './runtime.js';

export type PostgresDataGraphStorage = DataGraphDefaultStorage<
  ReturnType<typeof createPostgresDataGraphRuntime>
> & {
  kind: 'postgres';
};

export const createPostgresDataGraphStorage = (options: {
  pool: Pick<Pool, 'query'>;
  mappings?: readonly PostgresEntityMapping[];
  naming?: PostgresDataGraphNaming;
  overrides?: PostgresDataGraphMappingOverrides;
  pageSizeOptions?: PostgresReflectedEntityDataReaderOptions['pageSizeOptions'];
}): PostgresDataGraphStorage => {
  let mappings = options.mappings;
  const hasExplicitMappings = Boolean(options.mappings);
  const getMappings = () => {
    if (!mappings) {
      throw new Error(
        'PostgreSQL storage has no entities. Pass it to ontahi({ storage, entities }) or provide mappings explicitly.',
      );
    }
    return mappings;
  };

  return {
    kind: 'postgres',
    bindEntities: entities => {
      if (!hasExplicitMappings) mappings = inferPostgresMappings(entities, options);
    },
    createRuntime: () =>
      createPostgresDataGraphRuntime({
        pool: options.pool,
        mappings: getMappings(),
      }),
    readEntityData: query =>
      createPostgresReflectedEntityDataReader({
        pool: options.pool,
        mappings: getMappings(),
        pageSizeOptions: options.pageSizeOptions,
      }).readEntityData(query),
  };
};
