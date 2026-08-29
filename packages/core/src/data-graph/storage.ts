import type { AnyEntityDefinition } from './definitions.js';
import type { ReflectedEntityDataReader, ReflectedRelatedEntityDataReader } from './reflection.js';
import type { DataGraphExecutionRuntime } from './runtime.js';

export type DataGraphDefaultStorage<
  TRuntime extends DataGraphExecutionRuntime<any, any, any, any> = DataGraphExecutionRuntime<
    any,
    any,
    any,
    any
  >,
> = {
  bindEntities?: (entities: readonly AnyEntityDefinition[]) => void;
  createRuntime: () => TRuntime;
  readEntityData: ReflectedEntityDataReader['readEntityData'];
  readRelatedEntityData?: ReflectedRelatedEntityDataReader['readRelatedEntityData'];
};
