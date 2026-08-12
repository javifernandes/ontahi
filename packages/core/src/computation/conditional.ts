import { Effect } from 'effect';

export type ComputationBranch<TValue, TError = never, TRequirements = never> =
  | Effect.Effect<TValue, TError, TRequirements>
  | (() => Effect.Effect<TValue, TError, TRequirements>);

export type BooleanComputation<TError = never, TRequirements = never> = Effect.Effect<
  boolean,
  TError,
  TRequirements
> & {
  thenIf<TTrue, TTrueError = never, TTrueRequirements = never>(
    whenTrue: ComputationBranch<TTrue, TTrueError, TTrueRequirements>,
  ): Effect.Effect<TTrue | void, TError | TTrueError, TRequirements | TTrueRequirements>;
  thenIf<
    TTrue,
    TTrueError = never,
    TTrueRequirements = never,
    TFalse = void,
    TFalseError = never,
    TFalseRequirements = never,
  >(
    whenTrue: ComputationBranch<TTrue, TTrueError, TTrueRequirements>,
    whenFalse: ComputationBranch<TFalse, TFalseError, TFalseRequirements>,
  ): Effect.Effect<
    TTrue | TFalse,
    TError | TTrueError | TFalseError,
    TRequirements | TTrueRequirements | TFalseRequirements
  >;
};

export const nothing: Effect.Effect<void> = Effect.void;

const resolveBranch = <TValue, TError, TRequirements>(
  branch: ComputationBranch<TValue, TError, TRequirements>,
) => (typeof branch === 'function' ? branch() : branch);

export const booleanComputation = <TError = never, TRequirements = never>(
  computation: Effect.Effect<boolean, TError, TRequirements>,
): BooleanComputation<TError, TRequirements> =>
  Object.assign(computation, {
    thenIf: (
      whenTrue: ComputationBranch<unknown, unknown, unknown>,
      whenFalse: ComputationBranch<unknown, unknown, unknown> = nothing,
    ) =>
      computation.pipe(
        Effect.flatMap(condition =>
          Effect.suspend(() => resolveBranch(condition ? whenTrue : whenFalse)),
        ),
      ),
  }) as BooleanComputation<TError, TRequirements>;
