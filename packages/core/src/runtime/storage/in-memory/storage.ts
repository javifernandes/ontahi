import type { AnyEntityDefinition } from '../../../model/entity/definition.js';
import type { RelationshipFact } from '../../../model/relation/command.js';
import {
  createInMemoryReplicatedCollectionStorage,
  type ReplicatedCollectionStorage,
} from '../../../model/replication/collection-observer.js';
import type { DataGraphDefaultStorage } from '../contract.js';
import { createRuntimeReflectedRelatedEntityDataReader } from '../reflected-related-entity-data.js';

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
  relationships: RelationshipFact[];
  replicatedCollectionStorage: ReplicatedCollectionStorage;
};

export const createInMemoryDataGraphStorage = (
  options: {
    dataset?: InMemoryDataset;
    entities?: readonly AnyEntityDefinition[];
    pageSizeOptions?: InMemoryReflectedEntityDataReaderOptions['pageSizeOptions'];
    relationships?: RelationshipFact[];
  } = {},
): InMemoryDataGraphStorage => {
  const dataset = options.dataset ?? {};
  const relationships = options.relationships ?? [];
  const replicatedCollectionStorage = createInMemoryReplicatedCollectionStorage();
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
    graphReadCapabilities: { relationSelections: true },
    dataset,
    relationships,
    replicatedCollectionStorage,
    bindEntities: declarations => {
      entities = declarations;
    },
    createRuntime: () =>
      createInMemoryDataGraphRuntime({ dataset, entities: entities ?? [], relationships }),
    readEntityData: query =>
      createInMemoryReflectedEntityDataReader({
        dataset,
        entities: getEntities(),
        relationships,
        pageSizeOptions: options.pageSizeOptions,
      }).readEntityData(query),
    readRelatedEntityData: query =>
      createRuntimeReflectedRelatedEntityDataReader({
        createRuntime: () =>
          createInMemoryDataGraphRuntime({
            dataset,
            entities: getEntities(),
            relationships,
          }),
        getEntities,
      }).readRelatedEntityData(query),
  };
};
