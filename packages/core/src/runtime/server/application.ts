import { Effect } from 'effect';

import type { GraphApi, ReflectedEntityDataReader } from '../../data-graph/index.js';
import { defineGraphApi } from '../../data-graph/index.js';
import type { TaskSnapshot } from '../contracts.js';
import type { OperationPermissionResult } from '../operation-invocation.js';

import type { ArchitectureAppFacade } from './app-facade.js';
import type { OperationInvocationOperation } from './operation-invocation.js';
import type { OperationInvocationResult } from './operation-result.js';
import type { TaskRunIdentity } from './tasks.js';

type AnyGraphApi = GraphApi<any>;
type AnyApplicationEntity = object;
type RuntimeWithReflectedEntityData = ArchitectureAppFacade<any, any> & {
  graph: {
    readEntityData?: ReflectedEntityDataReader['readEntityData'];
  };
};

type OntahiApplicationRuntimeOptions = {
  runtime: ArchitectureAppFacade<any, any>;
  reflectedEntityDataReader?: ReflectedEntityDataReader;
};

export type DefineOntahiApplicationOptions<TGraph extends AnyGraphApi> =
  OntahiApplicationRuntimeOptions & {
    graph: TGraph;
  };

export type DefineOntahiApplicationFromEntitiesOptions<
  TEntities extends Record<string, AnyApplicationEntity>,
> = OntahiApplicationRuntimeOptions & {
  entities: TEntities;
};

export type OntahiApplication<TGraph extends AnyGraphApi = AnyGraphApi> = {
  graph: TGraph;
  reflectedEntityDataReader?: ReflectedEntityDataReader;
  resolveOperation: (operationId: string) => OperationInvocationOperation | undefined;
  invokeOperation: (
    operation: OperationInvocationOperation,
    input?: unknown,
  ) => Promise<OperationInvocationResult>;
  checkPermission: (
    operation: OperationInvocationOperation,
    input: unknown,
  ) => Promise<OperationPermissionResult>;
  getTaskSnapshot: (ref: TaskRunIdentity) => Promise<TaskSnapshot>;
};

export function defineOntahiApplication<TGraph extends AnyGraphApi>(
  options: DefineOntahiApplicationOptions<TGraph>,
): OntahiApplication<TGraph>;
export function defineOntahiApplication<TEntities extends Record<string, AnyApplicationEntity>>(
  options: DefineOntahiApplicationFromEntitiesOptions<TEntities>,
): OntahiApplication<GraphApi<TEntities>>;
export function defineOntahiApplication(
  options:
    | DefineOntahiApplicationOptions<AnyGraphApi>
    | DefineOntahiApplicationFromEntitiesOptions<Record<string, AnyApplicationEntity>>,
): OntahiApplication {
  const graph = 'graph' in options ? options.graph : defineGraphApi({ entities: options.entities });
  const runtime = options.runtime as RuntimeWithReflectedEntityData;
  const reflectedEntityDataReader =
    options.reflectedEntityDataReader ??
    (runtime.graph.readEntityData ? { readEntityData: runtime.graph.readEntityData } : undefined);

  return {
    graph,
    reflectedEntityDataReader,
    resolveOperation: operationId =>
      graph.getDomainOperation(operationId) as OperationInvocationOperation | undefined,
    invokeOperation: (operation, input) => runtime.operation.invoke(operation, input as never),
    checkPermission: (operation, input) =>
      runtime.operation.checkPermission(operation, input as never),
    getTaskSnapshot: ref => Effect.runPromise(runtime.task.getSnapshot(ref)),
  };
}
