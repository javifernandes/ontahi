import type {
  GraphCommandSpec,
  GraphOperationDeclaration,
  QueryOrView,
  QuerySpec,
} from '@ontahi/core/data-graph';
import type { QueryKey, UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';

export interface ReactGraphExecutor<TReadOptions = unknown, TCommandOptions = TReadOptions> {
  get<TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ): Promise<TResult | null>;
  run<TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ): Promise<TResult[]>;
  count<TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ): Promise<number>;
  runCommand<TResult = void>(
    command: GraphCommandSpec<any, any, TResult>,
    options?: TCommandOptions,
  ): Promise<TResult>;
}

export type BuildableRead<TResult> = {
  build: () => QuerySpec<any, TResult>;
};

export type GraphReadSource<TResult = unknown> = QueryOrView<any, TResult> | BuildableRead<TResult>;

export type ReadParams<TRead> = TRead extends QueryOrView<infer TParams, any> ? TParams : undefined;

export type ReadResult<TRead> =
  TRead extends QueryOrView<any, infer TResult>
    ? TResult
    : TRead extends BuildableRead<infer TResult>
      ? TResult
      : never;

export type GraphQueryMode = 'get' | 'run' | 'count' | 'exists';

export type GraphQueryData<TRead, TMode extends GraphQueryMode> = TMode extends 'get'
  ? ReadResult<TRead> | null
  : TMode extends 'run'
    ? ReadResult<TRead>[]
    : TMode extends 'count'
      ? number
      : boolean;

export type GraphQueryOptions<TRead, TMode extends GraphQueryMode, TReadOptions = unknown> = Omit<
  UseQueryOptions<GraphQueryData<TRead, TMode>, Error, GraphQueryData<TRead, TMode>, QueryKey>,
  'queryKey' | 'queryFn'
> & {
  mode: TMode;
  params?: ReadParams<TRead>;
  queryKey?: QueryKey;
  runtimeOptions?: TReadOptions;
};

export type CommandLike<TResult> =
  | GraphCommandSpec<any, any, TResult>
  | {
      build: () => GraphCommandSpec<any, any, TResult>;
    };

export type GraphCommandBuilder<TVariables, TResult> = (
  variables: TVariables,
) => CommandLike<TResult>;

export type GraphOperationLike<TVariables, TResult> = GraphOperationDeclaration<
  TVariables,
  CommandLike<TResult>
> & {
  id: string;
};

export type GraphCommandHookOptions<
  TResult,
  TVariables,
  TContext,
  TCommandOptions = unknown,
> = Omit<UseMutationOptions<TResult, Error, TVariables, TContext>, 'mutationFn'> & {
  mutationKey?: QueryKey;
  runtimeOptions?: TCommandOptions;
  invalidateQueryKeys?: QueryKey[];
};
