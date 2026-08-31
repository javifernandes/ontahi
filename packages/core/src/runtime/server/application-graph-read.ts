import type { Effect } from 'effect';

import {
  isGraphReadExpression,
  type GraphReadExpression,
  type GraphReadIntent,
  type QueryBuilder,
  type QueryOrView,
  type QuerySpec,
  type ViewDefinition,
} from '../../data-graph/query.js';
import type { RelatedRootReadSpec } from '../../data-graph/relation-root.js';

import type { ArchitectureDefinition } from './architecture-types.js';
import { runServerEffectForArchitecture } from './runtime-effect.js';

export type ApplicationGraphRead =
  | QueryOrView<any, any>
  | GraphReadExpression<QueryOrView<any, any>, GraphReadIntent, any>;

type ApplicationGraphReadSource<TRead> =
  TRead extends GraphReadExpression<infer TSource, any, any> ? TSource : TRead;

type GraphReadSourceParams<TRead> =
  TRead extends ViewDefinition<infer TParams, any, any>
    ? TParams
    : TRead extends QueryBuilder<any, any> | QuerySpec<any, any> | RelatedRootReadSpec
      ? undefined
      : never;

type GraphReadSourceResult<TRead> =
  TRead extends ViewDefinition<any, any, infer TResult>
    ? TResult
    : TRead extends QueryBuilder<any, infer TResult>
      ? TResult
      : TRead extends QuerySpec<any, infer TResult>
        ? TResult
        : TRead extends RelatedRootReadSpec<any, any, any, any, any>
          ? NonNullable<TRead['__result']>
          : never;

export type ApplicationGraphReadParams<TRead> = GraphReadSourceParams<
  ApplicationGraphReadSource<TRead>
>;

export type ApplicationGraphReadResult<TRead> =
  TRead extends GraphReadExpression<infer TSource, infer TIntent, any>
    ? TIntent extends 'count'
      ? number
      : TIntent extends 'exists'
        ? boolean
        : TIntent extends 'one'
          ? GraphReadSourceResult<TSource>
          : GraphReadSourceResult<TSource> | null
    : GraphReadSourceResult<TRead>[];

type ApplicationGraphReadOptionValues<TReadOptions> = {
  scope?: string;
  runtimeOptions?: TReadOptions;
};

export type ApplicationGraphReadOptions<TRead, TReadOptions> = [
  ApplicationGraphReadParams<TRead>,
] extends [undefined]
  ? ApplicationGraphReadOptionValues<TReadOptions> & { params?: undefined }
  : ApplicationGraphReadOptionValues<TReadOptions> & {
      params: ApplicationGraphReadParams<TRead>;
    };

type ApplicationGraphReadArguments<TRead, TReadOptions> = [
  ApplicationGraphReadParams<TRead>,
] extends [undefined]
  ? [options?: ApplicationGraphReadOptions<TRead, TReadOptions>]
  : [options: ApplicationGraphReadOptions<TRead, TReadOptions>];

export type ApplicationGraphReadApi<TReadOptions = undefined> = {
  read: <TRead extends ApplicationGraphRead>(
    read: TRead,
    ...args: ApplicationGraphReadArguments<TRead, TReadOptions>
  ) => Promise<ApplicationGraphReadResult<TRead>>;
};

type ApplicationGraphReadRuntime<TReadOptions> = {
  getViewEffect: <TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) => Effect.Effect<TResult | null, unknown>;
  runViewEffect: <TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) => Effect.Effect<TResult[], unknown>;
  countViewEffect: <TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) => Effect.Effect<number, unknown>;
};

const DEFAULT_APPLICATION_GRAPH_READ_SCOPE = 'ontahi.graph.read';

export const createApplicationGraphReadApi = <TReadOptions>(
  runtime: ApplicationGraphReadRuntime<TReadOptions>,
  architecture: ArchitectureDefinition<unknown>,
): ApplicationGraphReadApi<TReadOptions> => ({
  read: async <TRead extends ApplicationGraphRead>(
    read: TRead,
    ...args: ApplicationGraphReadArguments<TRead, TReadOptions>
  ) => {
    const options = args[0];
    const expression = isGraphReadExpression(read) ? read : undefined;
    const source = (expression?.read ?? read) as QueryOrView<any, any>;
    const intent = expression?.intent ?? 'many';
    const params = options?.params;
    const runtimeOptions = options?.runtimeOptions;
    const effect =
      intent === 'many'
        ? runtime.runViewEffect(source, params, runtimeOptions)
        : intent === 'count'
          ? runtime.countViewEffect(source, params, runtimeOptions)
          : runtime.getViewEffect(source, params, runtimeOptions);
    const value = await runServerEffectForArchitecture(architecture, effect, {
      scope: options?.scope ?? DEFAULT_APPLICATION_GRAPH_READ_SCOPE,
    });

    return (intent === 'exists' ? value != null : value) as ApplicationGraphReadResult<TRead>;
  },
});
