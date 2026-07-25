import type { AnyEntityDefinition } from '../definitions.js';
import type { DataGraphDefaultStorage } from '../storage.js';

import type { InMemoryDataset } from './materialization.js';
import {
  createInMemoryReflectedEntityDataReader,
  type InMemoryReflectedEntityDataReaderOptions,
} from './reflected-entity-data.js';
import { createInMemoryDataGraphRuntime } from './runtime.js';

export type InMemoryDataGraphStorage = DataGraphDefaultStorage<
  ReturnType<typeof createInMemoryDataGraphRuntime>
> & {
  kind: 'in-memory';
  dataset: InMemoryDataset;
};

export const createInMemoryDataGraphStorage = (options: {
  dataset: InMemoryDataset;
  entities: readonly AnyEntityDefinition[];
  pageSizeOptions?: InMemoryReflectedEntityDataReaderOptions['pageSizeOptions'];
}): InMemoryDataGraphStorage => {
  const reader = createInMemoryReflectedEntityDataReader(options);

  return {
    kind: 'in-memory',
    dataset: options.dataset,
    createRuntime: () => createInMemoryDataGraphRuntime({ dataset: options.dataset }),
    readEntityData: reader.readEntityData,
  };
};
