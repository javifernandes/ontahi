import { AsyncLocalStorage } from 'node:async_hooks';

import type { JsonValue } from '../../value/json.js';
import { hasOwn } from '../../value/object.js';
import type { ResourceEvidenceDisclosure, TaskTrigger } from '../contracts.js';
import type { ExecutionIdentity } from '../identity.js';

export type { ExecutionIdentity, Principal } from '../identity.js';

import {
  createServerRuntimeResources,
  type ServerRuntimeResourceMap,
} from './context-resources.js';
import { withModelResourceLimits, type ModelResourceLimits } from './model/resource-governance.js';
import type { ResourceBindingRegistry } from './resource-binding.js';
import { withResourceEvidence } from './resource-evidence.js';
import {
  createSemanticExecutionContext,
  getCurrentSemanticExecutionContext,
  runWithSemanticExecutionContext,
  type SemanticExecutionOrigin,
} from './semantic-execution.js';

export type InvocationDelivery = {
  transport: NonNullable<TaskTrigger['ingress']>['kind'];
  provider: string;
  source: string;
  id: string;
  event?: string;
};

export type InvocationContext = ExecutionIdentity & {
  requestId?: string;
  delivery?: InvocationDelivery;
  resources: ServerRuntimeResourceMap;
  resourceBindings: ResourceBindingRegistry;
  resourceBindingScope?: JsonValue;
  resolvedResourceBindings: Map<string, Promise<unknown>>;
};

export type InvocationContextInput = {
  principal?: ExecutionIdentity['principal'];
  /** Trusted provenance established by the ingress adapter. */
  requestId?: string;
  delivery?: InvocationDelivery;
  cacheScope?: JsonValue;
  resources?: ServerRuntimeResourceMap;
  /** Host-owned configured Resource resolvers. Ordinary inputs cannot select these bindings. */
  resourceBindings?: ResourceBindingRegistry;
  /** Trusted lookup scope for contextual Resource bindings. It is not an authorization grant. */
  resourceBindingScope?: JsonValue;
  /** Receiver-admitted provenance. It never grants authority or selects cache/accounting scope. */
  origin?: SemanticExecutionOrigin;
  /** Host-owned model limits. Nested invocation scopes may only narrow them. */
  modelResourceLimits?: ModelResourceLimits;
  /** Host-owned projection policy. Nested invocation scopes may only reduce disclosure. */
  resourceEvidenceDisclosure?: ResourceEvidenceDisclosure;
};

const invocationContextStorage = new AsyncLocalStorage<InvocationContext>();

export const getCurrentInvocationContext = (): InvocationContext | undefined =>
  invocationContextStorage.getStore();

const hasPrincipal = (input: InvocationContextInput) => hasOwn(input, 'principal');
const hasCacheScope = (input: InvocationContextInput) => hasOwn(input, 'cacheScope');
const hasResourceBindingScope = (input: InvocationContextInput) =>
  hasOwn(input, 'resourceBindingScope');

const resolveInvocationContext = (input: InvocationContextInput): InvocationContext => {
  const parent = getCurrentInvocationContext();
  const cacheScope = hasCacheScope(input) ? input.cacheScope : parent?.cacheScope;
  const resourceBindings = input.resourceBindings ?? parent?.resourceBindings ?? {};
  const resourceBindingScope = hasResourceBindingScope(input)
    ? input.resourceBindingScope
    : parent?.resourceBindingScope;
  const inheritsResourceResolution =
    input.resourceBindings === undefined && !hasResourceBindingScope(input) && !hasPrincipal(input);

  return {
    principal: hasPrincipal(input) ? (input.principal ?? null) : (parent?.principal ?? null),
    ...(cacheScope === undefined ? {} : { cacheScope }),
    requestId: hasOwn(input, 'requestId') ? input.requestId : parent?.requestId,
    delivery: hasOwn(input, 'delivery') ? input.delivery : parent?.delivery,
    resources: input.resources ?? parent?.resources ?? createServerRuntimeResources(),
    resourceBindings,
    ...(resourceBindingScope === undefined ? {} : { resourceBindingScope }),
    resolvedResourceBindings:
      inheritsResourceResolution && parent ? parent.resolvedResourceBindings : new Map(),
  };
};

export const withInvocationContext = <TValue>(
  context: InvocationContextInput,
  run: () => TValue,
): TValue => {
  const execution =
    getCurrentSemanticExecutionContext() ?? createSemanticExecutionContext(context.origin);
  return runWithSemanticExecutionContext(execution, () =>
    withModelResourceLimits(context.modelResourceLimits, () =>
      withResourceEvidence(context.resourceEvidenceDisclosure, () =>
        invocationContextStorage.run(resolveInvocationContext(context), run),
      ),
    ),
  );
};
