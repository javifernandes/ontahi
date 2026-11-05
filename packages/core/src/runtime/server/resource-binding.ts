import type { JsonValue } from '../../value/json.js';
import { hasOwn } from '../../value/object.js';
import type { Principal } from '../identity.js';

import { getCurrentInvocationContext } from './invocation-context.js';

export type ResourceBindingReference<TValue> = {
  readonly kind: 'resource-binding';
  readonly id: string;
  /** Type-only witness. */
  readonly __value?: TValue;
};

export type ResourceBindingResolutionContext = {
  readonly principal: Principal | null;
  readonly scope?: JsonValue;
};

export type ResourceBindingResolver<TValue = unknown> = (
  context: ResourceBindingResolutionContext,
) => Promise<TValue> | TValue;

export type ResourceBindingRegistry = Readonly<Record<string, ResourceBindingResolver>>;

export class ResourceBindingNotConfiguredError extends Error {
  readonly code = 'resource_binding_not_configured';

  constructor(readonly resourceId: string) {
    super(`Resource binding "${resourceId}" is not configured.`);
    this.name = 'ResourceBindingNotConfiguredError';
  }
}

export class ResourceBindingResolutionError extends Error {
  readonly code = 'resource_binding_resolution_failed';

  constructor(readonly resourceId: string) {
    super(`Resource binding "${resourceId}" could not be resolved.`);
    this.name = 'ResourceBindingResolutionError';
  }
}

const assertResourceBindingId = (id: string): void => {
  if (id.trim().length === 0 || id.length > 256)
    throw new RangeError('Resource binding id must contain between 1 and 256 characters.');
};

export const resourceBinding = <TValue>(id: string): ResourceBindingReference<TValue> => {
  assertResourceBindingId(id);
  return Object.freeze({ kind: 'resource-binding', id });
};

export const resolveResourceBinding = async <TValue>(
  reference: ResourceBindingReference<TValue>,
): Promise<TValue> => {
  const context = getCurrentInvocationContext();
  if (!context) throw new ResourceBindingNotConfiguredError(reference.id);
  const resolver = hasOwn(context.resourceBindings, reference.id)
    ? context.resourceBindings[reference.id]
    : undefined;
  if (!resolver) throw new ResourceBindingNotConfiguredError(reference.id);

  const cached = context.resolvedResourceBindings.get(reference.id);
  if (cached) return cached as Promise<TValue>;

  const resolution = Promise.resolve()
    .then(() => resolver({ principal: context.principal, scope: context.resourceBindingScope }))
    .catch(() => {
      context.resolvedResourceBindings.delete(reference.id);
      throw new ResourceBindingResolutionError(reference.id);
    });
  context.resolvedResourceBindings.set(reference.id, resolution);
  return resolution as Promise<TValue>;
};
