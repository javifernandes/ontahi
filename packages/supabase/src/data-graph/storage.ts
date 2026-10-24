import {
  createRuntimeReflectedRelatedEntityDataReader,
  type AnyEntityDefinition,
  type DataGraphDefaultStorage,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';

import {
  applySupabaseDataGraphMappings,
  type SupabaseDataGraphMappingOverrides,
  type SupabaseDataGraphNaming,
} from './mapping.js';
import {
  createSupabaseReflectedEntityDataReader,
  type SupabaseReflectedEntityDataReaderOptions,
} from './reflected-entity-data.js';
import { createSupabaseDataGraphRuntime } from './runtime.js';
import type { SupabaseErrorFactory, SupabaseLikeClient } from './types.js';

type SupabaseDataGraphRuntime<TClient extends SupabaseLikeClient, TError> = ReturnType<
  typeof createSupabaseDataGraphRuntime<TClient, TError>
>;

export type SupabaseDataGraphStorage<
  TClient extends SupabaseLikeClient = SupabaseLikeClient,
  TError = Error,
> = DataGraphDefaultStorage<SupabaseDataGraphRuntime<TClient, TError>> & {
  kind: 'supabase';
};

export type CreateSupabaseDataGraphStorageOptions<
  TClient extends SupabaseLikeClient,
  TError = Error,
> = {
  client: TClient;
  naming?: SupabaseDataGraphNaming;
  overrides?: SupabaseDataGraphMappingOverrides;
  createError?: SupabaseErrorFactory<TError>;
  pageSizeOptions?: SupabaseReflectedEntityDataReaderOptions<TClient>['pageSizeOptions'];
  manyToManyRpcName?: string;
  relationshipRpcName?: string;
};

const defaultSupabaseStorageError: SupabaseErrorFactory<Error> = ({ message, cause }) =>
  Object.assign(new Error(message), { cause });

export const createSupabaseDataGraphStorage = <TClient extends SupabaseLikeClient, TError = Error>(
  options: CreateSupabaseDataGraphStorageOptions<TClient, TError>,
): SupabaseDataGraphStorage<TClient, TError> => {
  let entities: readonly AnyEntityDefinition[] | undefined;
  const getEntities = () => {
    if (!entities) {
      throw new Error(
        'Supabase storage has no entities. Bind it through ontahi({ storage, entities }).',
      );
    }
    return entities;
  };
  const createError =
    options.createError ?? (defaultSupabaseStorageError as SupabaseErrorFactory<TError>);
  const createRuntime = () =>
    createSupabaseDataGraphRuntime({
      getReadClient: () => Effect.succeed(options.client),
      getCommandClient: () => Effect.succeed(options.client),
      createError,
      entities: getEntities(),
      manyToManyRpcName: options.manyToManyRpcName,
      relationshipRpcName: options.relationshipRpcName,
    });

  return {
    kind: 'supabase',
    graphReadCapabilities: { relationSelections: true },
    bindEntities: declarations => {
      entities = declarations;
      applySupabaseDataGraphMappings({
        entities: declarations,
        naming: options.naming,
        overrides: options.overrides,
      });
    },
    createRuntime,
    readEntityData: query =>
      createSupabaseReflectedEntityDataReader({
        entities: getEntities(),
        getClient: () => options.client,
        pageSizeOptions: options.pageSizeOptions,
      }).readEntityData(query),
    readRelatedEntityData: query =>
      createRuntimeReflectedRelatedEntityDataReader({
        createRuntime,
        getEntities,
      }).readRelatedEntityData(query),
  };
};
