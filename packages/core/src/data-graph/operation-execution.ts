export type OperationRetryBackoff =
  | {
      kind: 'fixed';
      delayMs: number;
    }
  | {
      kind: 'exponential';
      initialMs: number;
      multiplier?: number;
      maxMs: number;
    };

export type OperationRetryPolicy<TFailureReason extends string = string> = {
  /** Total executions, including the initial attempt. */
  maxAttempts: number;
  /** Closed allowlist of typed Operation failure reasons eligible for retry. */
  when: readonly TFailureReason[];
  backoff?: OperationRetryBackoff;
};

export type DomainOperationExecutionMetadata<TFailureReason extends string = string> = {
  atomicity?: 'required';
  retry?: OperationRetryPolicy<TFailureReason>;
};

const assertFiniteNonNegative = (value: number, path: string) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a finite non-negative number.`);
  }
};

export const assertValidDomainOperationExecution = (
  operationId: string,
  execution: DomainOperationExecutionMetadata | undefined,
): void => {
  const retry = execution?.retry;
  if (!retry) return;

  if (!Number.isSafeInteger(retry.maxAttempts) || retry.maxAttempts < 1) {
    throw new Error(
      `Domain operation "${operationId}" execution.retry.maxAttempts must be a positive safe integer.`,
    );
  }
  if (
    !Array.isArray(retry.when) ||
    retry.when.length === 0 ||
    Array.from(retry.when).some(reason => typeof reason !== 'string' || reason.length === 0)
  ) {
    throw new Error(
      `Domain operation "${operationId}" execution.retry.when must contain non-empty failure reasons.`,
    );
  }
  if (new Set(retry.when).size !== retry.when.length) {
    throw new Error(
      `Domain operation "${operationId}" execution.retry.when must not contain duplicate failure reasons.`,
    );
  }

  const backoff = retry.backoff;
  if (!backoff) return;
  if (backoff.kind === 'fixed') {
    assertFiniteNonNegative(
      backoff.delayMs,
      `Domain operation "${operationId}" execution.retry.backoff.delayMs`,
    );
    return;
  }
  if (backoff.kind !== 'exponential') {
    throw new Error(
      `Domain operation "${operationId}" execution.retry.backoff.kind must be "fixed" or "exponential".`,
    );
  }
  assertFiniteNonNegative(
    backoff.initialMs,
    `Domain operation "${operationId}" execution.retry.backoff.initialMs`,
  );
  if (
    backoff.multiplier !== undefined &&
    (!Number.isFinite(backoff.multiplier) || backoff.multiplier < 1)
  ) {
    throw new Error(
      `Domain operation "${operationId}" execution.retry.backoff.multiplier must be a finite number greater than or equal to 1.`,
    );
  }
  assertFiniteNonNegative(
    backoff.maxMs,
    `Domain operation "${operationId}" execution.retry.backoff.maxMs`,
  );
};

export type OperationExecutionCapabilityRequirement = {
  kind: 'data-graph.atomicity';
};

export type OperationExecutionRuntimeCapability = OperationExecutionCapabilityRequirement;

export type OperationExecutionAffordance =
  | { status: 'local'; runtime: string }
  | { status: 'bridge'; authority: string; bridge: string }
  | {
      status: 'unavailable';
      missingCapabilities: readonly OperationExecutionCapabilityRequirement[];
    };

type OperationExecutionMetadataLike = {
  authority?: string;
  exposure?: string;
  execution?: DomainOperationExecutionMetadata;
};

export type OperationExecutionBindings = {
  local?: {
    runtime: string;
    capabilities: readonly OperationExecutionRuntimeCapability[];
  };
  bridge?: {
    authority: string;
    bridge: string;
  };
};

const DATA_GRAPH_ATOMICITY_REQUIREMENT = {
  kind: 'data-graph.atomicity',
} as const satisfies OperationExecutionCapabilityRequirement;

export const deriveOperationExecutionRequirements = (
  operation: OperationExecutionMetadataLike,
): readonly OperationExecutionCapabilityRequirement[] =>
  operation.execution?.atomicity === 'required' ? [DATA_GRAPH_ATOMICITY_REQUIREMENT] : [];

const missingOperationExecutionCapabilities = (
  requirements: readonly OperationExecutionCapabilityRequirement[],
  capabilities: readonly OperationExecutionRuntimeCapability[],
) => {
  const supported = new Set(capabilities.map(capability => capability.kind));
  return requirements.filter(requirement => !supported.has(requirement.kind));
};

export const resolveOperationExecutionAffordance = (
  operation: OperationExecutionMetadataLike,
  bindings: OperationExecutionBindings,
): OperationExecutionAffordance => {
  const requirements = deriveOperationExecutionRequirements(operation);
  const missingCapabilities = missingOperationExecutionCapabilities(
    requirements,
    bindings.local?.capabilities ?? [],
  );

  if (bindings.local && missingCapabilities.length === 0) {
    return { status: 'local', runtime: bindings.local.runtime };
  }

  if (bindings.bridge && (operation.exposure === undefined || operation.exposure === 'bridge')) {
    return {
      status: 'bridge',
      authority: bindings.bridge.authority,
      bridge: bindings.bridge.bridge,
    };
  }

  return { status: 'unavailable', missingCapabilities };
};
