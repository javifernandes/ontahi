import {
  createRuntimeReflectedRelatedEntityDataReader,
  type AnyEntityDefinition,
  type DataGraphDefaultStorage,
} from '@ontahi/core/data-graph';
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
import {
  createPostgresDataGraphRuntime,
  type PostgresTransactionDataGraphRuntime,
} from './runtime.js';

export type PostgresDataGraphStorage =
  DataGraphDefaultStorage<PostgresTransactionDataGraphRuntime> & {
    kind: 'postgres';
  };

export const createPostgresDataGraphStorage = (options: {
  pool: Pick<Pool, 'connect' | 'query'>;
  mappings?: readonly PostgresEntityMapping[];
  naming?: PostgresDataGraphNaming;
  overrides?: PostgresDataGraphMappingOverrides;
  pageSizeOptions?: PostgresReflectedEntityDataReaderOptions['pageSizeOptions'];
}): PostgresDataGraphStorage => {
  let mappings = options.mappings;
  let entities: readonly AnyEntityDefinition[] | undefined;
  const hasExplicitMappings = Boolean(options.mappings);
  const getMappings = () => {
    if (!mappings) {
      throw new Error(
        'PostgreSQL storage has no entities. Pass it to ontahi({ storage, entities }) or provide mappings explicitly.',
      );
    }
    return mappings;
  };
  const getEntities = () => {
    if (!entities) {
      throw new Error(
        'PostgreSQL storage has no entities. Bind it through ontahi({ storage, entities }).',
      );
    }
    return entities;
  };
  return {
    kind: 'postgres',
    bindEntities: declarations => {
      entities = declarations;
      if (!hasExplicitMappings) mappings = inferPostgresMappings(declarations, options);
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
    readRelatedEntityData: query =>
      createRuntimeReflectedRelatedEntityDataReader({
        createRuntime: () =>
          createPostgresDataGraphRuntime({
            pool: options.pool,
            mappings: getMappings(),
          }),
        getEntities,
      }).readRelatedEntityData(query),
  };
};
