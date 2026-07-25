import type { ReflectedEntityDataReader } from './reflection.js';
import type { DataGraphExecutionRuntime } from './runtime.js';

export type DataGraphDefaultStorage<
  TRuntime extends DataGraphExecutionRuntime<any, any, any, any> = DataGraphExecutionRuntime<
    any,
    any,
    any,
    any
  >,
> = {
  createRuntime: () => TRuntime;
  readEntityData: ReflectedEntityDataReader['readEntityData'];
};
