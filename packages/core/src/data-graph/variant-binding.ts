import { Effect } from 'effect';

import type { ExecutableGraphRead } from './binding.js';
import { VariantSelection } from './entity-variant.js';
import {
  isGraphReadExpression,
  QueryBuilder,
  type GraphReadExpression,
  type QueryOrView,
} from './query.js';

/** Structural read surface, without erasing a variant's discriminator or contextual types. */
export type VariantReadSource = {
  readonly variant: { readonly kind: 'entity-variant' };
  toQuery(): QueryBuilder<any, any>;
};

type ReadExecution<TRead extends QueryOrView<any, any>, TError, TOptions> = {
  exec(): ExecutableGraphRead<TRead, TError, TOptions>;
  run(options?: TOptions): ReturnType<ExecutableGraphRead<TRead, TError, TOptions>['run']>;
};

type BoundReadValue<T, TError, TOptions> = T extends VariantReadSource
  ? BoundVariantSelection<T, TError, TOptions>
  : T extends QueryBuilder<any, any>
    ? BoundVariantQuery<T, TError, TOptions>
    : T extends GraphReadExpression<unknown, infer TIntent, infer TResult>
      ? T & {
          run(
            options?: TOptions,
          ): Effect.Effect<
            TIntent extends 'count' ? number : TIntent extends 'exists' ? boolean : TResult | null,
            TError
          >;
        }
      : T;

type BoundOperand<T, TError, TOptions> = T extends VariantReadSource
  ? T | BoundVariantSelection<T, TError, TOptions>
  : T;

type BoundMembers<T, TError, TOptions> = {
  [K in keyof T]: K extends 'toQuery'
    ? T[K]
    : T[K] extends (...args: infer TArgs) => infer TResult
      ? (
          ...args: { [I in keyof TArgs]: BoundOperand<TArgs[I], TError, TOptions> }
        ) => BoundReadValue<TResult, TError, TOptions>
      : BoundReadValue<T[K], TError, TOptions>;
};

/** Membership remains deferred. Execution adds no mutation capabilities. */
export type BoundVariantSelection<
  T extends VariantReadSource,
  TError = never,
  TOptions = undefined,
> = BoundMembers<T, TError, TOptions> & ReadExecution<ReturnType<T['toQuery']>, TError, TOptions>;

/** Read shaping is deliberately separate from membership and contextual navigation. */
export type BoundVariantQuery<T extends QueryBuilder<any, any>, TError, TOptions> = BoundMembers<
  Pick<T, 'build' | 'orderBy' | 'limit' | 'one' | 'first' | 'count' | 'exists'>,
  TError,
  TOptions
> &
  ReadExecution<T, TError, TOptions>;

const originals = new WeakMap<object, object>();
const unwrap = (value: unknown) =>
  typeof value === 'object' && value !== null ? (originals.get(value) ?? value) : value;

export const createVariantReadBinder = <TError, TOptions>(
  execute: <TRead extends QueryOrView<any, any>>(
    read: TRead,
  ) => ExecutableGraphRead<TRead, TError, TOptions>,
) => {
  const project = (value: unknown): unknown => {
    if (isGraphReadExpression(value) && value.read instanceof QueryBuilder) {
      const executable = execute(value.read);
      return {
        ...value,
        run: (options?: TOptions) => {
          if (value.intent === 'count') return executable.count(undefined, options);
          const result = executable.get(undefined, options);
          return value.intent === 'exists' ? Effect.map(result, row => row !== null) : result;
        },
      };
    }
    if (!(value instanceof VariantSelection) && !(value instanceof QueryBuilder)) return value;
    const read = () => execute(value instanceof QueryBuilder ? value : value.toQuery());
    const bound = new Proxy(value, {
      has: (target, key) => key === 'exec' || key === 'run' || Reflect.has(target, key),
      get(target, key) {
        if (key === 'exec') return read;
        if (key === 'run') return (options?: TOptions) => read().run(undefined, options);
        const member = Reflect.get(target, key, target);
        if (typeof member !== 'function') return project(member);
        // Explicit lowering is an escape to an ordinary, unbound base Query.
        if (key === 'toQuery') return member.bind(target);
        return (...args: unknown[]) => project(Reflect.apply(member, target, args.map(unwrap)));
      },
    });
    originals.set(bound, value);
    return bound;
  };

  return {
    project,
    bind: <T extends VariantReadSource>(value: T): BoundVariantSelection<T, TError, TOptions> => {
      if (!(value instanceof VariantSelection))
        throw new TypeError('Expected a declared VariantSelection for read-only runtime binding.');
      return project(unwrap(value)) as BoundVariantSelection<T, TError, TOptions>;
    },
  };
};
