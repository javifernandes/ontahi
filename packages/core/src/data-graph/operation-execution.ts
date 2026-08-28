export type DomainOperationExecutionMetadata = {
  atomicity?: 'required';
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
