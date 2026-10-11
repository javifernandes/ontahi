'use client';

import {
  getGraphReadOutputDescriptor,
  graphOutput,
  hasRelationImage,
  isGraphReadExpression,
  normalizeGraphSchemaClientInput,
  resolveQuerySpec,
  toGraphReadRequest,
  toGraphReadRequestV2,
  type GraphCommandSpec,
  type GraphReadIntent,
  type GraphReadRequest,
  type EntityMutationCommand,
  type EntityMutationDelta,
  type ManyToManyRelationshipCommand,
  type OrderedRelationshipCommand,
  type RelationshipCommandResult,
  type QueryOrView,
  type ViewDefinition,
} from '@ontahi/core/data-graph';
import { executionIdentityCacheKey } from '@ontahi/core/runtime/identity';
import { wasRuntimeProtocolExecutionObserved } from '@ontahi/core/runtime/protocol';
import {
  experimental_streamedQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useExecutionIdentity, useGraphClientCache, useGraphExecutor } from './context.js';
import type {
  BuildableRead,
  CommandLike,
  GraphCommandBuilder,
  GraphCommandHookOptions,
  GraphMutationExecution,
  GraphOperationLike,
  GraphOperationClientInput,
  GraphOperationResult,
  GraphQueryData,
  GraphQueryMode,
  GraphQueryOptions,
  GraphReadSource,
  ReadParams,
  ReadResult,
  ReactGraphExecutor,
} from './executor.js';
import {
  invalidateSemanticGraphReads,
  withCanonicalGraphReadMeta,
  withUnknownGraphReadMeta,
} from './semantic-invalidation.js';

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

type SemanticMutationExecutor<TCommand, TResult, TCommandOptions> = {
  readonly run?: (command: TCommand, options?: TCommandOptions) => Promise<TResult>;
  readonly runExecution?: (
    command: TCommand,
    options?: TCommandOptions,
  ) => Promise<GraphMutationExecution<TResult>>;
  readonly associateGraphReadRefreshes?: ReactGraphExecutor['associateGraphReadRefreshes'];
  readonly unsupportedMessage: string;
};

const executeSemanticMutation = async <TCommand, TResult, TCommandOptions>(
  command: TCommand,
  runtimeOptions: TCommandOptions | undefined,
  executor: SemanticMutationExecutor<TCommand, TResult, TCommandOptions>,
): Promise<GraphMutationExecution<TResult>> => {
  if (executor.runExecution) return executor.runExecution(command, runtimeOptions);
  if (executor.run) return { value: await executor.run(command, runtimeOptions) };
  throw new Error(executor.unsupportedMessage);
};

const useSemanticMutationCommand = <TCommand, TResult, TVariables, TContext, TCommandOptions>(
  buildCommand: (variables: TVariables) => TCommand,
  executor: SemanticMutationExecutor<TCommand, TResult, TCommandOptions>,
  options?: GraphCommandHookOptions<TResult, TVariables, TContext, TCommandOptions>,
): UseMutationResult<TResult, Error, TVariables, TContext> => {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationKey: options?.mutationKey,
    mutationFn: async variables => {
      const execution = await executeSemanticMutation(
        buildCommand(variables),
        options?.runtimeOptions,
        executor,
      );
      if (execution.metadata?.committedMutations) {
        if (!wasRuntimeProtocolExecutionObserved(execution.metadata)) {
          const mutationCommitId = execution.metadata.mutationCommitId;
          await invalidateSemanticGraphReads(queryClient, execution.metadata.committedMutations, {
            ...(mutationCommitId
              ? {
                  causedBy: {
                    kind: 'committed-mutations' as const,
                    commitIds: [mutationCommitId],
                    overflow: false,
                  },
                }
              : {}),
            ...(executor.associateGraphReadRefreshes
              ? { associateRefreshes: executor.associateGraphReadRefreshes }
              : {}),
          });
        }
      } else {
        for (const queryKey of options?.invalidateQueryKeys ?? []) {
          await queryClient.invalidateQueries({ queryKey });
        }
      }
      return execution.value;
    },
    onSuccess: async (data, variables, onMutateResult, context) => {
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
};

const intentFromMode = (mode: GraphQueryMode): GraphReadIntent | 'many' =>
  mode === 'get' ? 'first' : mode === 'run' ? 'many' : mode;

const modeFromIntent = (intent: GraphReadIntent | 'many'): Exclude<GraphQueryMode, 'exists'> =>
  intent === 'many' ? 'run' : intent === 'count' ? 'count' : 'get';

const canonicalGraphReadRequest = <TResult>(
  read: PlainGraphReadSource<TResult>,
  intent: GraphReadIntent | 'many',
  params: ReadParams<GraphReadSource<TResult>> | undefined,
): GraphReadRequest => {
  const spec = resolveQuerySpec(resolveGraphRead(read), params);
  const mode = modeFromIntent(intent);
  return hasRelationImage(spec.selection)
    ? toGraphReadRequestV2(spec, mode)
    : toGraphReadRequest(spec, mode);
};

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

/** Give a live evaluation its own React Query lifecycle without changing the caller's key parts. */
const liveGraphQueryKey = (queryKey: QueryKey): QueryKey => [
  ...queryKey,
  { scope: 'ontahi.graph-read', lifecycle: 'live' },
];

/** Reconcile every complete observed value before exposing it as the current query snapshot. */
const observedSnapshots = async function* <TValue>(
  snapshots: AsyncIterable<TValue>,
  write: (snapshot: TValue) => void,
): AsyncIterable<TValue> {
  for await (const snapshot of snapshots) {
    write(snapshot);
    yield snapshot;
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
  const clientCache = useGraphClientCache();
  const expression = isGraphReadExpression(read) ? read : undefined;
  const source = (expression?.read ?? read) as PlainGraphReadSource<ReadResult<TRead>>;
  const mode = options?.mode ?? 'run';
  const intent = expression?.intent ?? intentFromMode(mode);
  let canonicalRequest: GraphReadRequest | undefined;
  try {
    canonicalRequest = canonicalGraphReadRequest(source, intent, options?.params);
  } catch {
    // Local/custom executors may support Reads that cannot cross the Runtime Protocol yet.
  }
  const lifecycle = options?.observation === 'live' ? 'live' : 'once';
  const baseQueryKey =
    options?.queryKey ??
    deriveGraphQueryKey(source, intent, options?.params, executionIdentityCacheKey(identity));
  const queryKey = lifecycle === 'live' ? liveGraphQueryKey(baseQueryKey) : baseQueryKey;
  const resolved = resolveGraphRead(source);
  const params = options?.params as any;
  const descriptor =
    intent === 'count' || intent === 'exists'
      ? graphOutput.opaque()
      : getGraphReadOutputDescriptor(resolved, params);
  const writeOutput = (value: GraphQueryData<TRead, TMode>) => {
    clientCache.writeOutput(
      queryKey,
      descriptor.kind === 'graph-output.array' && intent !== 'many'
        ? graphOutput.nullable(descriptor.item)
        : descriptor,
      value,
      { kind: 'graph-read', name: resolveQuerySpec(resolved, params).root.name },
    );
  };
  const queryFn =
    lifecycle === 'live'
      ? experimental_streamedQuery<
          GraphQueryData<TRead, TMode>,
          GraphQueryData<TRead, TMode>,
          QueryKey
        >({
          streamFn: context => {
            if (intent !== 'many') {
              throw new Error('Live Graph observation only supports many-result Queries.');
            }
            if (!graphExecutor.observe) {
              throw new Error('Graph executor does not support Query observation.');
            }
            const snapshots = graphExecutor.observe(resolved, params, options?.runtimeOptions, {
              signal: context.signal,
            });
            return observedSnapshots(
              snapshots as AsyncIterable<GraphQueryData<TRead, TMode>>,
              writeOutput,
            );
          },
          reducer: (_current, snapshot) => snapshot,
          initialValue: [] as GraphQueryData<TRead, TMode>,
          refetchMode: 'reset',
        })
      : async () => {
          const value =
            intent === 'many'
              ? await graphExecutor.run(resolved, params, options?.runtimeOptions)
              : intent === 'count'
                ? await graphExecutor.count(resolved, params, options?.runtimeOptions)
                : intent === 'exists'
                  ? (await graphExecutor.get(resolved, params, options?.runtimeOptions)) != null
                  : await graphExecutor.get(resolved, params, options?.runtimeOptions);

          writeOutput(value as GraphQueryData<TRead, TMode>);
          return value as GraphQueryData<TRead, TMode>;
        };
  const { observation: _observation, ...queryOptions } = options ?? {};

  return useQuery({
    ...queryOptions,
    meta: canonicalRequest
      ? withCanonicalGraphReadMeta(options?.meta, canonicalRequest, lifecycle)
      : withUnknownGraphReadMeta(options?.meta, lifecycle),
    queryKey,
    queryFn,
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
  const runExecution = graphExecutor.runCommandExecution
    ? (command: GraphCommandSpec<any, any, TResult>, runtimeOptions?: TCommandOptions) =>
        graphExecutor.runCommandExecution!<TResult>(command, runtimeOptions)
    : undefined;

  return useSemanticMutationCommand(
    variables => resolveGraphCommand(buildCommand(variables)),
    {
      run: (command, runtimeOptions) => graphExecutor.runCommand<TResult>(command, runtimeOptions),
      ...(runExecution ? { runExecution } : {}),
      ...(graphExecutor.associateGraphReadRefreshes
        ? { associateGraphReadRefreshes: graphExecutor.associateGraphReadRefreshes }
        : {}),
      unsupportedMessage: 'Graph executor does not support Graph Commands.',
    },
    options,
  );
}

export function useEntityMutationCommand<
  TVariables,
  TContext = unknown,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
>(
  buildCommand: (variables: TVariables) => EntityMutationCommand,
  options?: GraphCommandHookOptions<EntityMutationDelta, TVariables, TContext, TCommandOptions>,
): UseMutationResult<EntityMutationDelta, Error, TVariables, TContext> {
  const graphExecutor = useGraphExecutor<TReadOptions, TCommandOptions>();
  const run = graphExecutor.runEntityMutationCommand?.bind(graphExecutor);
  const runExecution = graphExecutor.runEntityMutationCommandExecution?.bind(graphExecutor);

  return useSemanticMutationCommand(
    buildCommand,
    {
      ...(run ? { run } : {}),
      ...(runExecution ? { runExecution } : {}),
      ...(graphExecutor.associateGraphReadRefreshes
        ? { associateGraphReadRefreshes: graphExecutor.associateGraphReadRefreshes }
        : {}),
      unsupportedMessage: 'Graph executor does not support Entity Mutation Commands.',
    },
    options,
  );
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
  const run = graphExecutor.runManyToManyRelationshipCommand?.bind(graphExecutor);
  const runExecution = graphExecutor.runManyToManyRelationshipCommandExecution?.bind(graphExecutor);

  return useSemanticMutationCommand(
    buildCommand,
    {
      ...(run ? { run } : {}),
      ...(runExecution ? { runExecution } : {}),
      ...(graphExecutor.associateGraphReadRefreshes
        ? { associateGraphReadRefreshes: graphExecutor.associateGraphReadRefreshes }
        : {}),
      unsupportedMessage: 'Graph executor does not support many-to-many Relationship Commands.',
    },
    options,
  );
}

export function useOrderedRelationshipCommand<
  TVariables,
  TContext = unknown,
  TReadOptions = unknown,
  TCommandOptions = TReadOptions,
>(
  buildCommand: (variables: TVariables) => OrderedRelationshipCommand,
  options?: GraphCommandHookOptions<
    RelationshipCommandResult,
    TVariables,
    TContext,
    TCommandOptions
  >,
): UseMutationResult<RelationshipCommandResult, Error, TVariables, TContext> {
  const graphExecutor = useGraphExecutor<TReadOptions, TCommandOptions>();
  const run = graphExecutor.runOrderedRelationshipCommand?.bind(graphExecutor);
  const runExecution = graphExecutor.runOrderedRelationshipCommandExecution?.bind(graphExecutor);

  return useSemanticMutationCommand(
    buildCommand,
    {
      ...(run ? { run } : {}),
      ...(runExecution ? { runExecution } : {}),
      ...(graphExecutor.associateGraphReadRefreshes
        ? { associateGraphReadRefreshes: graphExecutor.associateGraphReadRefreshes }
        : {}),
      unsupportedMessage: 'Graph executor does not support ordered Relationship Commands.',
    },
    options,
  );
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
