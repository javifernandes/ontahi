import type {
  GraphCommandSpec,
  GraphOperationDeclaration,
  GraphReadExpression,
  GraphReadIntent,
  GraphSchemaLike,
  InferGraphSchemaClientInput,
  QueryOrView,
  QuerySpec,
  ManyToManyRelationshipCommand,
  RelationshipCommand,
  RelationshipCommandResult,
  EntityMutationCommand,
  EntityMutationDelta,
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
  runRelationshipCommand?(
    command: RelationshipCommand,
    options?: TCommandOptions,
  ): Promise<RelationshipCommandResult>;
  runManyToManyRelationshipCommand?(
    command: ManyToManyRelationshipCommand,
    options?: TCommandOptions,
  ): Promise<RelationshipCommandResult>;
  runEntityMutationCommand?(
    command: EntityMutationCommand,
    options?: TCommandOptions,
  ): Promise<EntityMutationDelta>;
}

export type BuildableRead<TResult> = {
  build: () => QuerySpec<any, TResult>;
};

type PlainGraphReadSource<TResult> = QueryOrView<any, TResult> | BuildableRead<TResult>;

export type GraphReadSource<TResult = unknown> =
  | PlainGraphReadSource<TResult>
  | GraphReadExpression<PlainGraphReadSource<TResult>, GraphReadIntent, TResult>;

export type ReadParams<TRead> =
  TRead extends GraphReadExpression<infer TSource, any, any>
    ? ReadParams<TSource>
    : TRead extends QueryOrView<infer TParams, any>
      ? TParams
      : undefined;

export type ReadResult<TRead> =
  TRead extends GraphReadExpression<any, any, infer TResult>
    ? TResult
    : TRead extends QueryOrView<any, infer TResult>
      ? TResult
      : TRead extends BuildableRead<infer TResult>
        ? TResult
        : never;

export type GraphQueryMode = 'get' | 'run' | 'count' | 'exists';

type GraphReadIntentData<TRead, TIntent extends GraphReadIntent> = TIntent extends 'count'
  ? number
  : TIntent extends 'exists'
    ? boolean
    : TIntent extends 'one'
      ? ReadResult<TRead>
      : ReadResult<TRead> | null;

export type GraphQueryData<TRead, TMode extends GraphQueryMode = 'run'> =
  TRead extends GraphReadExpression<any, infer TIntent, any>
    ? GraphReadIntentData<TRead, TIntent>
    : TMode extends 'get'
      ? ReadResult<TRead> | null
      : TMode extends 'run'
        ? ReadResult<TRead>[]
        : TMode extends 'count'
          ? number
          : boolean;

export type GraphQueryOptions<
  TRead,
  TMode extends GraphQueryMode = 'run',
  TReadOptions = unknown,
> = Omit<
  UseQueryOptions<GraphQueryData<TRead, TMode>, Error, GraphQueryData<TRead, TMode>, QueryKey>,
  'queryKey' | 'queryFn'
> & {
  mode?: TRead extends GraphReadExpression<any, any, any> ? never : TMode;
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

export type GraphOperationClientInput<TOperation> = TOperation extends {
  input: infer TSchema extends GraphSchemaLike;
}
  ? InferGraphSchemaClientInput<TSchema>
  : TOperation extends GraphOperationDeclaration<infer TInput, any>
    ? TInput
    : never;

export type GraphOperationResult<TOperation> = TOperation extends {
  run: (...args: any[]) => CommandLike<infer TResult>;
}
  ? TResult
  : never;

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
