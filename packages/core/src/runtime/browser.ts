import { Effect, FiberRef } from 'effect';

const browserDataGraphRuntime = FiberRef.unsafeMake<unknown | undefined>(undefined);

export type RunBrowserEffectOptions<TRuntime = unknown> = {
  dataGraphRuntime?: TRuntime;
};

export const getCurrentBrowserDataGraphRuntimeEffect = <TRuntime>() =>
  FiberRef.get(browserDataGraphRuntime).pipe(
    Effect.map(runtime => runtime as TRuntime | undefined),
  );

export const getRequiredBrowserDataGraphRuntimeEffect = <TRuntime>() =>
  getCurrentBrowserDataGraphRuntimeEffect<TRuntime>().pipe(
    Effect.flatMap(runtime =>
      runtime === undefined
        ? Effect.die(
            new Error('Data graph runtime is not configured in the current browser context'),
          )
        : Effect.succeed(runtime),
    ),
  );

export const withBrowserDataGraphRuntime = <TRuntime, TValue, TError>(
  runtime: TRuntime,
  effect: Effect.Effect<TValue, TError>,
): Effect.Effect<TValue, TError> => Effect.locally(effect, browserDataGraphRuntime, runtime);

export const runBrowserEffect = <TValue, TRuntime = unknown>(
  effect: Effect.Effect<TValue, unknown>,
  options?: RunBrowserEffectOptions<TRuntime>,
) =>
  Effect.runPromise(
    options?.dataGraphRuntime === undefined
      ? effect
      : withBrowserDataGraphRuntime(options.dataGraphRuntime, effect),
  );

export const browserEffect =
  <TArgs extends unknown[], TValue, TError = unknown>(
    effectFactory: (...args: TArgs) => Effect.Effect<TValue, TError>,
  ) =>
  (...args: TArgs) =>
    runBrowserEffect(effectFactory(...args));
