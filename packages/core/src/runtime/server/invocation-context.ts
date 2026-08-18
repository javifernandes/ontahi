import { AsyncLocalStorage } from 'node:async_hooks';

import type { JsonValue } from '../../value/json.js';
import { hasOwn } from '../../value/object.js';
import type { ExecutionIdentity } from '../identity.js';

export type { ExecutionIdentity, Principal } from '../identity.js';

import {
  createServerRuntimeResources,
  type ServerRuntimeResourceMap,
} from './context-resources.js';

export type InvocationContext = ExecutionIdentity & {
  resources: ServerRuntimeResourceMap;
};

export type InvocationContextInput = {
  principal?: ExecutionIdentity['principal'];
  cacheScope?: JsonValue;
  resources?: ServerRuntimeResourceMap;
};

const invocationContextStorage = new AsyncLocalStorage<InvocationContext>();

export const getCurrentInvocationContext = (): InvocationContext | undefined =>
  invocationContextStorage.getStore();

const hasPrincipal = (input: InvocationContextInput) => hasOwn(input, 'principal');
const hasCacheScope = (input: InvocationContextInput) => hasOwn(input, 'cacheScope');

const resolveInvocationContext = (input: InvocationContextInput): InvocationContext => {
  const parent = getCurrentInvocationContext();
  const cacheScope = hasCacheScope(input) ? input.cacheScope : parent?.cacheScope;

  return {
    principal: hasPrincipal(input) ? (input.principal ?? null) : (parent?.principal ?? null),
    ...(cacheScope === undefined ? {} : { cacheScope }),
    resources: input.resources ?? parent?.resources ?? createServerRuntimeResources(),
  };
};

export const withInvocationContext = <TValue>(
  context: InvocationContextInput,
  run: () => TValue,
): TValue => invocationContextStorage.run(resolveInvocationContext(context), run);
