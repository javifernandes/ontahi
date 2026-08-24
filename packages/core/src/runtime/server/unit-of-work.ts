import { Effect, Exit, Fiber, Runtime } from 'effect';

import { normalizeEntityRef, type AnyEntityRef } from '../../data-graph/ref/index.js';

import {
  createContextResourceApi,
  type ServerContextResourceApi,
  type ServerRuntimeResourceMap,
} from './context-resources.js';
import type { OperationRuntimeContext } from './context-types.js';
import {
  getOperationRuntimeContext,
  getRequiredOperationRuntimeContext,
  operationRuntimeContextStorage,
} from './context.js';

export type UnitOfWork = {
  readonly resources: ServerContextResourceApi;
  readonly refs: UnitOfWorkRefResolutionApi;
};

export type UnitOfWorkRefResolutionOptions<TValue> = {
  readonly key?: string | symbol;
  readonly load: () => TValue;
};

export type UnitOfWorkRefResolutionApi = {
  resolve: <TValue>(ref: AnyEntityRef, options: UnitOfWorkRefResolutionOptions<TValue>) => TValue;
  invalidate: (ref: AnyEntityRef) => void;
};

export type ChildUnitOfWorkOptions = {
  isolatedResources?: Iterable<string>;
  resources?: Iterable<readonly [string, unknown]>;
};

const unitOfWorkByResources = new WeakMap<ServerRuntimeResourceMap, UnitOfWork>();
const DEFAULT_REF_RESOLUTION_KEY = Symbol('ontahi.unitOfWork.refs.default');

const createUnitOfWorkRefResolutionApi = (): UnitOfWorkRefResolutionApi => {
  const resolutionsByRef = new Map<string, Map<string | symbol, unknown>>();

  return {
    resolve: <TValue>(
      ref: AnyEntityRef,
      options: UnitOfWorkRefResolutionOptions<TValue>,
    ): TValue => {
      const refKey = normalizeEntityRef(ref);
      let resolutions = resolutionsByRef.get(refKey);
      if (!resolutions) {
        resolutions = new Map();
        resolutionsByRef.set(refKey, resolutions);
      }
      const resolutionKey = options.key ?? DEFAULT_REF_RESOLUTION_KEY;
      if (resolutions.has(resolutionKey)) return resolutions.get(resolutionKey) as TValue;

      const loaded = options.load();
      resolutions.set(resolutionKey, loaded);
      return loaded;
    },
    invalidate: ref => {
      resolutionsByRef.delete(normalizeEntityRef(ref));
    },
  };
};

const resolveUnitOfWork = (resources: ServerRuntimeResourceMap): UnitOfWork => {
  const existing = unitOfWorkByResources.get(resources);
  if (existing) return existing;

  const created = {
    resources: createContextResourceApi(resources),
    refs: createUnitOfWorkRefResolutionApi(),
  };
  unitOfWorkByResources.set(resources, created);
  return created;
};

export const getCurrentUnitOfWork = (): UnitOfWork | undefined => {
  const context = getOperationRuntimeContext();
  return context ? resolveUnitOfWork(context.resources) : undefined;
};

export const getRequiredUnitOfWork = (): UnitOfWork => {
  const current = getCurrentUnitOfWork();
  if (!current) throw new Error('UnitOfWork is not available outside a server operation context');
  return current;
};

const resumeOutsideChildContext = <TValue>(
  parent: OperationRuntimeContext | undefined,
  resume: () => TValue,
): TValue =>
  parent
    ? operationRuntimeContextStorage.run(parent, resume)
    : operationRuntimeContextStorage.exit(resume);

const runInOperationContext = <TValue, TError, TRequirements>(
  context: OperationRuntimeContext,
  effect: Effect.Effect<TValue, TError, TRequirements>,
): Effect.Effect<TValue, TError, TRequirements> =>
  Effect.runtime<TRequirements>().pipe(
    Effect.flatMap(runtime =>
      Effect.async<TValue, TError>((resume, signal) => {
        const parent = getOperationRuntimeContext();
        const fiber = operationRuntimeContextStorage.run(context, () =>
          Runtime.runFork(runtime)(effect, { immediate: true }),
        );

        fiber.addObserver(exit =>
          resumeOutsideChildContext(parent, () =>
            resume(
              Exit.match(exit, {
                onFailure: Effect.failCause,
                onSuccess: Effect.succeed,
              }),
            ),
          ),
        );

        if (signal.aborted) {
          Runtime.runFork(runtime)(Fiber.interrupt(fiber), { immediate: true });
        }

        return Effect.sync(() => {
          Runtime.runFork(runtime)(Fiber.interrupt(fiber), { immediate: true });
        });
      }),
    ),
  );

export const withChildUnitOfWork = <TValue, TError, TRequirements>(
  effect: Effect.Effect<TValue, TError, TRequirements>,
  options: ChildUnitOfWorkOptions = {},
): Effect.Effect<TValue, TError, TRequirements> =>
  Effect.suspend(() => {
    const parent = getRequiredOperationRuntimeContext();
    const resources = new Map(parent.resources);
    for (const key of options.isolatedResources ?? []) resources.delete(key);
    for (const [key, value] of options.resources ?? []) resources.set(key, value);

    return runInOperationContext({ ...parent, resources }, effect);
  });
