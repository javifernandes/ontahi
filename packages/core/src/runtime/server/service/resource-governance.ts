import { AsyncLocalStorage } from 'node:async_hooks';

export type ServiceResourceLimits = {
  /** Maximum charged attempts against this service in one semantic execution family. */
  readonly maxAttempts?: number;
};

export type ServiceResourceAdmission = {
  readonly attempt: number;
  readonly maxAttempts?: number;
};

type ServiceResourceState = {
  readonly limits: ServiceResourceLimits;
  readonly counter: { attempts: number };
};

const storage = new AsyncLocalStorage<ReadonlyMap<string, ServiceResourceState>>();

export class ServiceResourceExhaustedError extends Error {
  readonly code = 'service_resource_exhausted';

  constructor(
    readonly resourceId: string,
    readonly maxAttempts: number,
  ) {
    super(`Service Resource "${resourceId}" attempt limit exhausted (${maxAttempts}).`);
    this.name = 'ServiceResourceExhaustedError';
  }
}

const validateLimits = (limits: ServiceResourceLimits): ServiceResourceLimits => {
  if (
    limits.maxAttempts !== undefined &&
    (!Number.isInteger(limits.maxAttempts) || limits.maxAttempts <= 0)
  )
    throw new RangeError('maxAttempts must be a positive integer.');
  return limits;
};

export const withServiceResourceLimits = <TValue>(
  resourceId: string,
  limits: ServiceResourceLimits | undefined,
  run: () => TValue,
): TValue => {
  if (!limits) return run();
  const parent = storage.getStore();
  const inherited = parent?.get(resourceId);
  const requested = validateLimits(limits);
  const maxAttempts =
    inherited?.limits.maxAttempts === undefined
      ? requested.maxAttempts
      : requested.maxAttempts === undefined
        ? inherited.limits.maxAttempts
        : Math.min(inherited.limits.maxAttempts, requested.maxAttempts);
  const resources = new Map(parent);
  resources.set(resourceId, {
    limits: maxAttempts === undefined ? {} : { maxAttempts },
    counter: inherited?.counter ?? { attempts: 0 },
  });
  return storage.run(resources, run);
};

export const admitServiceResourceAttempt = (
  resourceId: string,
): ServiceResourceAdmission | undefined => {
  const state = storage.getStore()?.get(resourceId);
  if (!state) return undefined;
  const attempt = state.counter.attempts + 1;
  if (state.limits.maxAttempts !== undefined && attempt > state.limits.maxAttempts)
    throw new ServiceResourceExhaustedError(resourceId, state.limits.maxAttempts);
  state.counter.attempts = attempt;
  return { attempt, ...state.limits };
};
