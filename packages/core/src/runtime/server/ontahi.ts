import type {
  DataGraphDefaultStorage,
  DataGraphExecutionRuntime,
  GraphApi,
} from '../../data-graph/index.js';

import type { ArchitectureAppFacade } from './app-facade.js';
import { defineOntahiApplication, type OntahiApplication } from './application.js';
import { architecture } from './architecture-registry.js';
import { createDataGraphArchitectureAdapter } from './data-graph-app-adapter.js';
import {
  bindOntahiEntity,
  type AnyOntahiEntityDeclaration,
  type BoundOntahiEntityDeclaration,
} from './entity.js';
import type { TaskConfig } from './tasks.js';

type AnyDataGraphRuntime = DataGraphExecutionRuntime<any, any, any, any>;
type OntahiGraphFacade = ReturnType<
  typeof createDataGraphArchitectureAdapter<unknown, any, any, any, AnyDataGraphRuntime>
>;
type OntahiRuntimeDefinition = {
  graph: OntahiGraphFacade;
  task: TaskConfig;
};

export type OntahiApplicationBuilder = ArchitectureAppFacade<unknown, OntahiRuntimeDefinition>;

export type OntahiOptions<
  TStorage extends DataGraphDefaultStorage<AnyDataGraphRuntime>,
  TEntities extends Record<string, object> | readonly AnyOntahiEntityDeclaration[],
> = {
  storage: TStorage;
  tasks?: TaskConfig;
  entities: TEntities | ((app: OntahiApplicationBuilder) => TEntities);
};

type BoundEntityRecord<TEntities> = TEntities extends readonly AnyOntahiEntityDeclaration[]
  ? {
      [TEntity in TEntities[number] as TEntity['name']]: BoundOntahiEntityDeclaration<TEntity>;
    }
  : TEntities extends Record<string, object>
    ? TEntities
    : never;

export type ComposedOntahiApplication<
  TStorage extends DataGraphDefaultStorage<AnyDataGraphRuntime>,
  TEntities extends Record<string, object> | readonly AnyOntahiEntityDeclaration[],
> = OntahiApplication<GraphApi<BoundEntityRecord<TEntities>>> & {
  storage: TStorage;
};

export const ontahi = <
  TStorage extends DataGraphDefaultStorage<AnyDataGraphRuntime>,
  const TEntities extends Record<string, object> | readonly AnyOntahiEntityDeclaration[],
>(
  options: OntahiOptions<TStorage, TEntities>,
): ComposedOntahiApplication<TStorage, TEntities> => {
  const graph = createDataGraphArchitectureAdapter<unknown, any, any, any, AnyDataGraphRuntime>({
    defaultStorage: options.storage,
  });
  const registered = architecture({
    graph,
    task: options.tasks ?? {},
  });
  const declaredEntities =
    typeof options.entities === 'function' ? options.entities(registered.app) : options.entities;
  const entities = (
    Array.isArray(declaredEntities)
      ? Object.fromEntries(
          declaredEntities.map(declaration => [
            declaration.name,
            bindOntahiEntity(declaration, registered.app),
          ]),
        )
      : declaredEntities
  ) as BoundEntityRecord<TEntities>;

  return Object.assign(
    defineOntahiApplication({
      entities,
      runtime: registered.app,
    }),
    {
      storage: options.storage,
    },
  );
};
