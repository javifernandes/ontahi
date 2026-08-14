import { AsyncLocalStorage } from 'node:async_hooks';

import {
  createServerRuntimeResources,
  type ServerRuntimeResourceMap,
} from './context-resources.js';

export type Principal = {
  subject: string;
  kind: 'user' | 'service';
  issuer?: string;
};

export type InvocationContext = {
  principal: Principal | null;
  resources: ServerRuntimeResourceMap;
};

export type InvocationContextInput = {
  principal?: Principal | null;
  resources?: ServerRuntimeResourceMap;
};

const invocationContextStorage = new AsyncLocalStorage<InvocationContext>();

export const getCurrentInvocationContext = (): InvocationContext | undefined =>
  invocationContextStorage.getStore();

const hasPrincipal = (input: InvocationContextInput) =>
  Object.prototype.hasOwnProperty.call(input, 'principal');

const resolveInvocationContext = (input: InvocationContextInput): InvocationContext => {
  const parent = getCurrentInvocationContext();

  return {
    principal: hasPrincipal(input) ? (input.principal ?? null) : (parent?.principal ?? null),
    resources: input.resources ?? parent?.resources ?? createServerRuntimeResources(),
  };
};

export const withInvocationContext = <TValue>(
  context: InvocationContextInput,
  run: () => TValue,
): TValue => invocationContextStorage.run(resolveInvocationContext(context), run);
