import {
  createRuntimeReflectedRelatedEntityDataReader,
  type AnyEntityDefinition,
  type DataGraphDefaultStorage,
} from '@ontahi/core/data-graph';
import type { Pool } from 'mysql2/promise';

import {
  inferMysqlMappings,
  type MysqlDataGraphMappingOverrides,
  type MysqlDataGraphNaming,
  type MysqlEntityMapping,
} from './mapping.js';
import {
  createMysqlReflectedEntityDataReader,
  type MysqlReflectedEntityDataReaderOptions,
} from './reflected-entity-data.js';
import { createMysqlDataGraphRuntime, type MysqlTransactionDataGraphRuntime } from './runtime.js';

export type MysqlDataGraphStorage = DataGraphDefaultStorage<MysqlTransactionDataGraphRuntime> & {
  kind: 'mysql';
};

export const createMysqlDataGraphStorage = (options: {
  pool: Pick<Pool, 'getConnection' | 'execute'>;
  mappings?: readonly MysqlEntityMapping[];
  naming?: MysqlDataGraphNaming;
  overrides?: MysqlDataGraphMappingOverrides;
  pageSizeOptions?: NonNullable<MysqlReflectedEntityDataReaderOptions['pageSizeOptions']>;
}): MysqlDataGraphStorage => {
  let mappings = options.mappings;
  let entities: readonly AnyEntityDefinition[] | undefined;
  const hasExplicitMappings = Boolean(options.mappings);
  const getMappings = () => {
    if (!mappings) {
      throw new Error(
        'MySQL storage has no entities. Pass it to ontahi({ storage, entities }) or provide mappings explicitly.',
      );
    }
    return mappings;
  };
  const getEntities = () => {
    if (!entities) {
      throw new Error(
        'MySQL storage has no entities. Bind it through ontahi({ storage, entities }).',
      );
    }
    return entities;
  };
  return {
    kind: 'mysql',
    bindEntities: declarations => {
      entities = declarations;
      if (!hasExplicitMappings) mappings = inferMysqlMappings(declarations, options);
    },
    createRuntime: () =>
      createMysqlDataGraphRuntime({
        pool: options.pool,
        mappings: getMappings(),
      }),
    readEntityData: query =>
      createMysqlReflectedEntityDataReader({
        pool: options.pool,
        mappings: getMappings(),
        pageSizeOptions: options.pageSizeOptions,
      }).readEntityData(query),
    readRelatedEntityData: query =>
      createRuntimeReflectedRelatedEntityDataReader({
        createRuntime: () =>
          createMysqlDataGraphRuntime({
            pool: options.pool,
            mappings: getMappings(),
          }),
        getEntities,
      }).readRelatedEntityData(query),
  };
};
