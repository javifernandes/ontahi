import type { GraphSchemaDefinition } from '../data-graph/index.js';

import {
  resolveOperationApplicationHole,
  type OperationApplicationHoleResolution,
  type ResolveOperationApplicationHoleOptions,
} from './operation-application-resolution.js';
import {
  operationApplicationHoles,
  substituteOperationApplication,
  type OperationApplication,
  type OperationApplicationContract,
  type OperationApplicationSubstitutionResult,
} from './operation-application.js';

export type OperationApplicationHolePosition = {
  readonly name: string;
  readonly schema: GraphSchemaDefinition;
};

export type OperationApplicationHoleResolutionContext = {
  readonly contract: OperationApplicationContract;
  readonly application: OperationApplication;
  readonly holeId: string;
  readonly positions: readonly OperationApplicationHolePosition[];
};

export type OperationApplicationFreeInputResolution = {
  readonly status: 'free-input';
  readonly holeId: string;
};

export type OperationApplicationResolverOutcome =
  | OperationApplicationHoleResolution
  | OperationApplicationFreeInputResolution;

export type OperationApplicationHoleResolver = (
  context: OperationApplicationHoleResolutionContext,
) => Promise<OperationApplicationResolverOutcome | undefined>;

export type ResolveOperationApplicationHoleWithOptions = {
  readonly contract: OperationApplicationContract;
  readonly application: OperationApplication;
  readonly holeId: string;
  readonly resolvers: readonly OperationApplicationHoleResolver[];
};

export type OperationApplicationFreeInputResult =
  | {
      readonly success: true;
      readonly application: OperationApplication;
      readonly provenance: { readonly kind: 'free-input' };
    }
  | Extract<OperationApplicationSubstitutionResult, { readonly success: false }>;

const holePositions = (
  contract: OperationApplicationContract,
  application: OperationApplication,
  holeId: string,
): readonly OperationApplicationHolePosition[] | undefined => {
  const positions = Object.entries(application.arguments).flatMap(([name, argument]) => {
    if (argument.kind !== 'hole' || argument.id !== holeId) return [];
    const schema = contract.input.fields[name];
    return schema ? [{ name, schema: schema as GraphSchemaDefinition }] : [];
  });
  const expected = Object.values(application.arguments).filter(
    argument => argument.kind === 'hole' && argument.id === holeId,
  ).length;
  return positions.length === expected ? positions : undefined;
};

export const resolveOperationApplicationHoleWith = async ({
  contract,
  application,
  holeId,
  resolvers,
}: ResolveOperationApplicationHoleWithOptions): Promise<OperationApplicationResolverOutcome> => {
  if (contract.id !== application.operationId)
    return { status: 'unresolved', holeId, reason: 'unknown-operation' };
  if (!operationApplicationHoles(application).includes(holeId))
    return { status: 'unresolved', holeId, reason: 'unknown-hole' };

  const positions = holePositions(contract, application, holeId);
  if (!positions) return { status: 'unresolved', holeId, reason: 'unsupported-hole' };
  const context = { contract, application, holeId, positions };

  for (const resolver of resolvers) {
    const outcome = await resolver(context);
    if (outcome) return outcome;
  }
  return { status: 'unresolved', holeId, reason: 'unsupported-hole' };
};

const scalarFieldTypes = new Set(['id', 'string', 'number', 'boolean', 'date', 'enum']);

export const scalarFreeInputOperationApplicationResolver: OperationApplicationHoleResolver =
  async ({ holeId, positions }) =>
    positions.every(
      position =>
        position.schema.kind === 'field' && scalarFieldTypes.has(position.schema.fieldType),
    )
      ? { status: 'free-input', holeId }
      : undefined;

export const createAuthorizedEntityRefOperationApplicationResolver =
  <TAuthority>(
    options: Omit<ResolveOperationApplicationHoleOptions<TAuthority>, 'application' | 'holeId'>,
  ): OperationApplicationHoleResolver =>
  async ({ application, holeId }) => {
    const outcome = await resolveOperationApplicationHole({ ...options, application, holeId });
    return outcome.status === 'unresolved' && outcome.reason === 'unsupported-hole'
      ? undefined
      : outcome;
  };

export const submitOperationApplicationFreeInput = (
  contract: OperationApplicationContract,
  application: OperationApplication,
  resolution: OperationApplicationFreeInputResolution,
  value: unknown,
): OperationApplicationFreeInputResult => {
  if (!operationApplicationHoles(application).includes(resolution.holeId))
    return { success: false, reason: 'unknown-hole', holeId: resolution.holeId };

  const substitution = substituteOperationApplication(
    contract,
    application,
    resolution.holeId,
    value,
  );
  return substitution.success
    ? {
        success: true,
        application: substitution.application,
        provenance: { kind: 'free-input' },
      }
    : substitution;
};
