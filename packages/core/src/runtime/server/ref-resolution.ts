import { Effect } from 'effect';

import type {
  EntityRefInputResolutionScope,
  EntityRefInputResolver,
} from '../../data-graph/ref/index.js';
import { anonymousExecutionIdentity, executionIdentityCacheKey } from '../identity.js';

import { getCurrentInvocationContext } from './invocation-context.js';
import { getCurrentUnitOfWork } from './unit-of-work.js';

const resolverKeys = new WeakMap<EntityRefInputResolver, Map<string, symbol>>();

const getResolverKey = (resolver: EntityRefInputResolver): symbol => {
  const identityKey = JSON.stringify(
    executionIdentityCacheKey(getCurrentInvocationContext() ?? anonymousExecutionIdentity),
  );
  let keysByIdentity = resolverKeys.get(resolver);
  if (!keysByIdentity) {
    keysByIdentity = new Map();
    resolverKeys.set(resolver, keysByIdentity);
  }
  const existing = keysByIdentity.get(identityKey);
  if (existing) return existing;

  const created = Symbol('ontahi.unitOfWork.refs.resolver');
  keysByIdentity.set(identityKey, created);
  return created;
};

const memoizeEffectResolution = <TResult>(resolution: TResult): TResult =>
  (Effect.isEffect(resolution) ? Effect.runSync(Effect.cached(resolution)) : resolution) as TResult;

export const unitOfWorkEntityRefInputResolutionScope: EntityRefInputResolutionScope = {
  resolve: (ref, resolver) => {
    const unitOfWork = getCurrentUnitOfWork();
    if (!unitOfWork) return resolver(ref);

    return unitOfWork.refs.resolve(ref, {
      key: getResolverKey(resolver),
      load: () => memoizeEffectResolution(resolver(ref)),
    });
  },
};
