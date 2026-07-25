import type { DataGraphDefaultStorage } from '@ontahi/core/data-graph';
import type { Pool } from 'pg';

import type { PostgresEntityMapping } from './mapping.js';
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
  mappings: readonly PostgresEntityMapping[];
  pageSizeOptions?: PostgresReflectedEntityDataReaderOptions['pageSizeOptions'];
}): PostgresDataGraphStorage => {
  const reader = createPostgresReflectedEntityDataReader(options);

  return {
    kind: 'postgres',
    createRuntime: () =>
      createPostgresDataGraphRuntime({
        pool: options.pool,
        mappings: options.mappings,
      }),
    readEntityData: reader.readEntityData,
  };
};
