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

export const createInMemoryDataGraphStorage = (
  options: {
    dataset?: InMemoryDataset;
    entities?: readonly AnyEntityDefinition[];
    pageSizeOptions?: InMemoryReflectedEntityDataReaderOptions['pageSizeOptions'];
  } = {},
): InMemoryDataGraphStorage => {
  const dataset = options.dataset ?? {};
  let entities = options.entities;
  const getEntities = () => {
    if (!entities) {
      throw new Error(
        'In-memory storage has no entities. Pass it to ontahi({ storage, entities }) or provide entities explicitly.',
      );
    }
    return entities;
  };

  return {
    kind: 'in-memory',
    dataset,
    bindEntities: declarations => {
      entities = declarations;
    },
    createRuntime: () => createInMemoryDataGraphRuntime({ dataset }),
    readEntityData: query =>
      createInMemoryReflectedEntityDataReader({
        dataset,
        entities: getEntities(),
        pageSizeOptions: options.pageSizeOptions,
      }).readEntityData(query),
  };
};
