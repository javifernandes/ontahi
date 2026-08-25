'use client';

import {
  isGraphReadExpression,
  normalizeGraphSchemaClientInput,
  resolveQuerySpec,
  toGraphReadRequest,
  type GraphCommandSpec,
  type GraphReadIntent,
  type ManyToManyRelationshipCommand,
  type RelationshipCommandResult,
  type QueryOrView,
  type ViewDefinition,
} from '@ontahi/core/data-graph';
import { executionIdentityCacheKey } from '@ontahi/core/runtime/identity';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useExecutionIdentity, useGraphExecutor } from './context.js';
import type {
  BuildableRead,
  CommandLike,
  GraphCommandBuilder,
  GraphCommandHookOptions,
  GraphOperationLike,
  GraphOperationClientInput,
  GraphOperationResult,
  GraphQueryData,
  GraphQueryMode,
  GraphQueryOptions,
  GraphReadSource,
  ReadParams,
  ReadResult,
} from './executor.js';

const isQueryOrView = <TResult>(
  read: Exclude<GraphReadSource<TResult>, { kind: 'graph-read-expression' }>,
): read is QueryOrView<any, TResult> => 'kind' in read;

const isBuildableRead = <TResult>(
  read: Exclude<GraphReadSource<TResult>, { kind: 'graph-read-expression' }>,
): read is BuildableRead<TResult> => typeof (read as BuildableRead<TResult>).build === 'function';

const isNamedView = <TResult>(
  read: QueryOrView<any, TResult>,
): read is ViewDefinition<any, any, TResult> => 'kind' in read && read.kind === 'view';

type PlainGraphReadSource<TResult> = Exclude<
  GraphReadSource<TResult>,
  { kind: 'graph-read-expression' }
>;

const resolveGraphRead = <TResult>(read: PlainGraphReadSource<TResult>) =>
  (isQueryOrView(read) ? read : isBuildableRead(read) ? read.build() : read) as QueryOrView<
    any,
    TResult
  >;

const resolveGraphCommand = <TResult>(command: CommandLike<TResult>) =>
  ('build' in command ? command.build() : command) as GraphCommandSpec<any, any, TResult>;

const intentFromMode = (mode: GraphQueryMode): GraphReadIntent | 'many' =>
  mode === 'get' ? 'first' : mode === 'run' ? 'many' : mode;

const modeFromIntent = (intent: GraphReadIntent | 'many'): Exclude<GraphQueryMode, 'exists'> =>
  intent === 'many' ? 'run' : intent === 'count' ? 'count' : 'get';

const deriveGraphQueryKey = <TRead>(
  read: PlainGraphReadSource<ReadResult<TRead>>,
  intent: GraphReadIntent | 'many',
  params: ReadParams<TRead> | undefined,
  identityKey: readonly unknown[],
): QueryKey => {
  const resolved = isQueryOrView(read) ? read : resolveGraphRead(read);

  if (isNamedView(resolved)) {
    return [
      resolved.root.name,
      'graph-read',
      identityKey,
      intent,
      'view',
      resolved.name,
      params ?? null,
    ];
  }

  try {
    const request = toGraphReadRequest(resolveQuerySpec(resolved, params), modeFromIntent(intent));
    return [request.selection.entityName, 'graph-read', identityKey, intent, request];
  } catch (error) {
    const message =
      'useGraphQuery could not infer a transport-safe queryKey; provide queryKey explicitly';
    throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export function useGraphQuery<
  TRead extends GraphReadSource<any>,
  TMode extends GraphQueryMode = 'run',
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
>(
  read: TRead,
  options?: GraphQueryOptions<TRead, TMode, TReadOptions>,
): UseQueryResult<GraphQueryData<TRead, TMode>, Error> {
  const graphExecutor = useGraphExecutor<TReadOptions, TCommandOptions>();
  const identity = useExecutionIdentity();
  const expression = isGraphReadExpression(read) ? read : undefined;
  const source = (expression?.read ?? read) as PlainGraphReadSource<ReadResult<TRead>>;
  const mode = options?.mode ?? 'run';
  const intent = expression?.intent ?? intentFromMode(mode);

  return useQuery({
    ...options,
    queryKey:
      options?.queryKey ??
      deriveGraphQueryKey(source, intent, options?.params, executionIdentityCacheKey(identity)),
    queryFn: async () => {
      const resolved = resolveGraphRead(source);
      const params = options?.params as any;

      const value =
        intent === 'many'
          ? await graphExecutor.run(resolved, params, options?.runtimeOptions)
          : intent === 'count'
            ? await graphExecutor.count(resolved, params, options?.runtimeOptions)
            : intent === 'exists'
              ? (await graphExecutor.get(resolved, params, options?.runtimeOptions)) != null
              : await graphExecutor.get(resolved, params, options?.runtimeOptions);

      return value as GraphQueryData<TRead, TMode>;
    },
  });
}

export function useGraphCommand<
  TVariables,
  TResult = void,
  TContext = unknown,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
>(
  buildCommand: GraphCommandBuilder<TVariables, TResult>,
  options?: GraphCommandHookOptions<TResult, TVariables, TContext, TCommandOptions>,
): UseMutationResult<TResult, Error, TVariables, TContext> {
  const graphExecutor = useGraphExecutor<TReadOptions, TCommandOptions>();
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationKey: options?.mutationKey,
    mutationFn: variables =>
      graphExecutor.runCommand(
        resolveGraphCommand(buildCommand(variables)),
        options?.runtimeOptions,
      ),
    onSuccess: async (data, variables, onMutateResult, context) => {
      for (const queryKey of options?.invalidateQueryKeys ?? []) {
        await queryClient.invalidateQueries({ queryKey });
      }

      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useManyToManyRelationshipCommand<
  TVariables,
  TContext = unknown,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
>(
  buildCommand: (variables: TVariables) => ManyToManyRelationshipCommand,
  options?: GraphCommandHookOptions<
    RelationshipCommandResult,
    TVariables,
    TContext,
    TCommandOptions
  >,
): UseMutationResult<RelationshipCommandResult, Error, TVariables, TContext> {
  const graphExecutor = useGraphExecutor<TReadOptions, TCommandOptions>();
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationKey: options?.mutationKey,
    mutationFn: variables => {
      if (!graphExecutor.runManyToManyRelationshipCommand) {
        throw new Error('Graph executor does not support many-to-many Relationship Commands.');
      }
      return graphExecutor.runManyToManyRelationshipCommand(
        buildCommand(variables),
        options?.runtimeOptions,
      );
    },
    onSuccess: async (data, variables, onMutateResult, context) => {
      for (const queryKey of options?.invalidateQueryKeys ?? []) {
        await queryClient.invalidateQueries({ queryKey });
      }
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useGraphOperation<
  TOperation extends GraphOperationLike<any, any>,
  TContext = unknown,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
>(
  operation: TOperation,
  options?: GraphCommandHookOptions<
    GraphOperationResult<TOperation>,
    GraphOperationClientInput<TOperation>,
    TContext,
    TCommandOptions
  >,
): UseMutationResult<
  GraphOperationResult<TOperation>,
  Error,
  GraphOperationClientInput<TOperation>,
  TContext
> {
  type TVariables = GraphOperationClientInput<TOperation>;
  type TResult = GraphOperationResult<TOperation>;
  const buildCommand = (variables: TVariables) =>
    operation.run(
      (operation.input
        ? normalizeGraphSchemaClientInput(operation.input, variables)
        : variables) as never,
    );

  return useGraphCommand<TVariables, TResult, TContext, TReadOptions, TCommandOptions>(
    buildCommand,
    {
      mutationKey: options?.mutationKey ?? ['graph-operation', operation.id],
      ...options,
    },
  );
}
