import type {
  ReflectedEntityDataReader,
  ReflectedRelatedEntityDataReader,
} from '../../data-graph/reflection.js';
import type { AnyEntityDefinition } from '../../model/entity/definition.js';
import type { DataGraphExecutionRuntime } from '../data/runtime.js';

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
};
