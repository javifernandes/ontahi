import type { AnyEntityDefinition } from '../../model/entity/definition.js';
import type { ReplicatedCollectionStorageCapability } from '../../model/replication/collection-observer.js';
import type { DataGraphExecutionRuntime } from '../data/runtime.js';
import type {
  ReflectedEntityDataReader,
  ReflectedRelatedEntityDataReader,
} from '../server/reflection.js';

export type DataGraphDefaultStorage<
  TRuntime extends DataGraphExecutionRuntime<any, any, any, any> = DataGraphExecutionRuntime<
    any,
    any,
    any,
    any
  >,
> = {
  /** Provider-owned execution support, not a caller's authorization to navigate relations. */
  readonly graphReadCapabilities?: { readonly relationSelections?: true };
  bindEntities?: (entities: readonly AnyEntityDefinition[]) => void;
  createRuntime: () => TRuntime;
  readEntityData: ReflectedEntityDataReader['readEntityData'];
  readRelatedEntityData?: ReflectedRelatedEntityDataReader['readRelatedEntityData'];
} & Partial<ReplicatedCollectionStorageCapability>;
