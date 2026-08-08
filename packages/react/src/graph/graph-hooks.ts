'use client';

import {
  normalizeGraphSchemaClientInput,
  type GraphCommandSpec,
  type QueryOrView,
  type ViewDefinition,
} from '@ontahi/core/data-graph';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useGraphExecutor } from './context.js';
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
  read: GraphReadSource<TResult>,
): read is QueryOrView<any, TResult> => 'kind' in read;

const isBuildableRead = <TResult>(read: GraphReadSource<TResult>): read is BuildableRead<TResult> =>
  typeof (read as BuildableRead<TResult>).build === 'function';

const isNamedView = <TResult>(
  read: QueryOrView<any, TResult>,
): read is ViewDefinition<any, any, TResult> => 'kind' in read && read.kind === 'view';

const resolveGraphRead = <TResult>(read: GraphReadSource<TResult>) =>
  (isQueryOrView(read) ? read : isBuildableRead(read) ? read.build() : read) as QueryOrView<
    any,
    TResult
  >;

const resolveGraphCommand = <TResult>(command: CommandLike<TResult>) =>
  ('build' in command ? command.build() : command) as GraphCommandSpec<any, any, TResult>;

const deriveGraphQueryKey = <TRead, TMode extends GraphQueryMode, TReadOptions>(
  read: GraphReadSource<ReadResult<TRead>>,
  mode: TMode,
  params: ReadParams<TRead> | undefined,
  runtimeOptions: TReadOptions | undefined,
): QueryKey => {
  const resolved = isQueryOrView(read) ? read : resolveGraphRead(read);

  if (isNamedView(resolved)) {
    return ['graph', mode, resolved.name, params ?? null, runtimeOptions ?? null];
  }

  throw new Error('useGraphQuery requires queryKey for unnamed selections or query specs');
};

export function useGraphQuery<
  TRead,
  TMode extends GraphQueryMode,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
>(
  read: GraphReadSource<ReadResult<TRead>>,
  options: GraphQueryOptions<TRead, TMode, TReadOptions>,
): UseQueryResult<GraphQueryData<TRead, TMode>, Error> {
  const graphExecutor = useGraphExecutor<TReadOptions, TCommandOptions>();

  return useQuery({
    ...options,
    queryKey:
      options.queryKey ??
      deriveGraphQueryKey(read, options.mode, options.params, options.runtimeOptions),
    queryFn: async () => {
      const resolved = resolveGraphRead(read);
      const params = options.params as any;

      const value =
        options.mode === 'get'
          ? await graphExecutor.get(resolved, params, options.runtimeOptions)
          : options.mode === 'run'
            ? await graphExecutor.run(resolved, params, options.runtimeOptions)
            : options.mode === 'count'
              ? await graphExecutor.count(resolved, params, options.runtimeOptions)
              : (await graphExecutor.get(resolved, params, options.runtimeOptions)) != null;

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
