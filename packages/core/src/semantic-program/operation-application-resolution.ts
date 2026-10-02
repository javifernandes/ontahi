import type {
  AnyEntityDefinition,
  GraphReadDispatcher,
  GraphSchemaDefinition,
} from '../data-graph/index.js';
import {
  createEntityIdentityRef,
  createRecursiveEntityView,
  getEntityIdentityLocator,
  isReferenceFieldDefinition,
  query,
  toGraphReadRequest,
} from '../data-graph/index.js';

import {
  substituteOperationApplication,
  type OperationApplication,
  type OperationApplicationContract,
} from './operation-application.js';

type OperationApplicationGraph = {
  readonly getOperation: (operationId: string) =>
    | {
        readonly id: string;
        readonly input?: { readonly kind: string };
      }
    | undefined;
};

export type OperationApplicationResolutionCandidate = {
  readonly value: unknown;
  readonly provenance: {
    readonly kind: 'authorized-graph-read';
    readonly entityName: string;
  };
};

export type OperationApplicationHoleResolution =
  | {
      readonly status: 'bound';
      readonly application: OperationApplication;
      readonly candidate: OperationApplicationResolutionCandidate;
    }
  | {
      readonly status: 'choice';
      readonly holeId: string;
      readonly candidates: readonly OperationApplicationResolutionCandidate[];
    }
  | {
      readonly status: 'unresolved';
      readonly holeId: string;
      readonly reason:
        | 'unknown-operation'
        | 'unknown-hole'
        | 'unsupported-hole'
        | 'no-candidates'
        | 'access-denied'
        | 'resolution-unavailable';
    };

export type ResolveOperationApplicationHoleOptions<TAuthority> = {
  readonly graph: OperationApplicationGraph;
  readonly read: GraphReadDispatcher<TAuthority>;
  readonly authority: TAuthority;
  readonly application: OperationApplication;
  readonly holeId: string;
};

const referenceTarget = (schema: GraphSchemaDefinition): AnyEntityDefinition | undefined =>
  schema.kind === 'field' && isReferenceFieldDefinition(schema) ? schema.target : undefined;

const referenceTargetForHole = (
  contract: OperationApplicationContract,
  application: OperationApplication,
  holeId: string,
): AnyEntityDefinition | undefined => {
  const positions = Object.entries(application.arguments).filter(
    ([, argument]) => argument.kind === 'hole' && argument.id === holeId,
  );
  if (positions.length === 0) return undefined;

  const targets = positions.map(([name]) => {
    const schema = contract.input.fields[name];
    return schema ? referenceTarget(schema as GraphSchemaDefinition) : undefined;
  });
  const target = targets[0];
  return target && targets.every(candidate => candidate === target) ? target : undefined;
};

const identityProjection = (entity: AnyEntityDefinition) => {
  const identity = getEntityIdentityLocator(entity);
  if (!identity?.locator.fields?.length) return undefined;

  const shape = Object.fromEntries(
    identity.locator.fields.map(fieldName => [fieldName, true as const]),
  );
  return query(entity).as(
    createRecursiveEntityView(
      entity,
      `${entity.name}OperationApplicationCandidate`,
      shape as never,
    ),
  );
};

const operationContract = (
  graph: OperationApplicationGraph,
  operationId: string,
): OperationApplicationContract | undefined => {
  const operation = graph.getOperation(operationId);
  return operation?.input?.kind === 'schema.object'
    ? (operation as OperationApplicationContract)
    : undefined;
};

export const resolveOperationApplicationHole = async <TAuthority>({
  graph,
  read,
  authority,
  application,
  holeId,
}: ResolveOperationApplicationHoleOptions<TAuthority>): Promise<OperationApplicationHoleResolution> => {
  const contract = operationContract(graph, application.operationId);
  if (!contract) return { status: 'unresolved', holeId, reason: 'unknown-operation' };

  const hasHole = Object.values(application.arguments).some(
    argument => argument.kind === 'hole' && argument.id === holeId,
  );
  if (!hasHole) return { status: 'unresolved', holeId, reason: 'unknown-hole' };

  const target = referenceTargetForHole(contract, application, holeId);
  const selection = target && identityProjection(target);
  if (!target || !selection) return { status: 'unresolved', holeId, reason: 'unsupported-hole' };

  const response = await read(toGraphReadRequest(selection, 'run'), { authority });
  if (response.kind === 'protocol-error')
    return {
      status: 'unresolved',
      holeId,
      reason: response.error.code === 'access_denied' ? 'access-denied' : 'resolution-unavailable',
    };
  if (response.kind !== 'graph-read-result' || !Array.isArray(response.value))
    return { status: 'unresolved', holeId, reason: 'resolution-unavailable' };

  const candidates = response.value.flatMap(snapshot => {
    if (typeof snapshot !== 'object' || snapshot === null) return [];
    const value = createEntityIdentityRef(target, snapshot as Record<string, unknown>);
    return value
      ? [
          {
            value,
            provenance: { kind: 'authorized-graph-read' as const, entityName: target.name },
          },
        ]
      : [];
  });
  if (candidates.length !== response.value.length)
    return { status: 'unresolved', holeId, reason: 'resolution-unavailable' };
  if (candidates.length === 0) return { status: 'unresolved', holeId, reason: 'no-candidates' };
  if (candidates.length > 1) return { status: 'choice', holeId, candidates };

  const candidate = candidates[0]!;
  const substitution = substituteOperationApplication(
    contract,
    application,
    holeId,
    candidate.value,
  );
  return substitution.success
    ? { status: 'bound', application: substitution.application, candidate }
    : { status: 'unresolved', holeId, reason: 'resolution-unavailable' };
};
