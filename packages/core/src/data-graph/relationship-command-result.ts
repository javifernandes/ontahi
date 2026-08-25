import { isRecord } from '../value/object.js';

import type { RelationConstraintRejection } from './definitions.js';
import { isEntityRef } from './ref/index.js';
import type {
  CanonicalManyToManyRelationIdentity,
  CanonicalRelationIdentity,
  ManyToManyRelationshipCommand,
  RelationshipCommand,
  RelationshipDelta,
  RelationshipFact,
} from './relationship-command.js';

export type RelationshipCommandDiagnostic = {
  reason: 'relationship_precondition_failed' | 'relation_constraint_rejected';
  rejection: RelationConstraintRejection;
};

export type RelationshipCommandResult =
  | { status: 'applied'; delta: RelationshipDelta }
  | { status: 'not-applied'; diagnostic: RelationshipCommandDiagnostic };

const hasValidDiagnosticParameters = (value: unknown) =>
  value === undefined ||
  (isRecord(value) &&
    Object.values(value).every(
      parameter =>
        parameter === null ||
        typeof parameter === 'string' ||
        (typeof parameter === 'number' && Number.isFinite(parameter)) ||
        typeof parameter === 'boolean',
    ));

export const isRelationConstraintRejection = (
  value: unknown,
): value is RelationConstraintRejection =>
  isRecord(value) &&
  value.version === 1 &&
  typeof value.code === 'string' &&
  typeof value.message === 'string' &&
  hasValidDiagnosticParameters(value.parameters);

export const isRelationshipCommandDiagnostic = (
  value: unknown,
): value is RelationshipCommandDiagnostic =>
  isRecord(value) &&
  (value.reason === 'relationship_precondition_failed' ||
    value.reason === 'relation_constraint_rejected') &&
  isRelationConstraintRejection(value.rejection);

const isCanonicalRelationIdentity = (
  value: unknown,
): value is CanonicalRelationIdentity | CanonicalManyToManyRelationIdentity =>
  isRecord(value) &&
  typeof value.sourceEntityName === 'string' &&
  typeof value.targetEntityName === 'string' &&
  (typeof value.fieldName === 'string' ||
    (typeof value.relationName === 'string' && value.cardinality === 'many-to-many'));

const isRelationshipFact = (value: unknown): value is RelationshipFact =>
  isRecord(value) &&
  isCanonicalRelationIdentity(value.relation) &&
  isEntityRef(value.source) &&
  isEntityRef(value.target);

export const isRelationshipCommandResult = (value: unknown): value is RelationshipCommandResult =>
  isRecord(value) &&
  ((value.status === 'applied' &&
    isRecord(value.delta) &&
    Array.isArray(value.delta.added) &&
    value.delta.added.every(isRelationshipFact) &&
    Array.isArray(value.delta.removed) &&
    value.delta.removed.every(isRelationshipFact)) ||
    (value.status === 'not-applied' && isRelationshipCommandDiagnostic(value.diagnostic)));

export const relationshipPreconditionDiagnostic = (
  command: RelationshipCommand,
): RelationshipCommandDiagnostic => ({
  reason: 'relationship_precondition_failed',
  rejection: {
    version: 1,
    code: 'relationship_precondition_failed',
    message: 'Current Relation target did not match the command precondition.',
    parameters: {
      sourceEntityName: command.relation.sourceEntityName,
      fieldName: command.relation.fieldName,
      targetEntityName: command.relation.targetEntityName,
    },
  },
});

export const relationshipConstraintDiagnostic = (
  rejection: RelationConstraintRejection,
): RelationshipCommandDiagnostic => ({ reason: 'relation_constraint_rejected', rejection });

export const appliedRelationshipCommand = (
  delta: RelationshipDelta,
): RelationshipCommandResult => ({ status: 'applied', delta });

export const notAppliedRelationshipCommand = (
  command: RelationshipCommand,
): RelationshipCommandResult => ({
  status: 'not-applied',
  diagnostic: relationshipPreconditionDiagnostic(command),
});

export const relationshipCommandDiagnosticFromError = (
  error: unknown,
  command: RelationshipCommand | ManyToManyRelationshipCommand,
): RelationshipCommandDiagnostic | undefined => {
  const seen = new Set<unknown>();
  const pending: unknown[] = [error];
  while (pending.length > 0 && seen.size < 64) {
    const current = pending.shift();
    if (!isRecord(current) || seen.has(current)) continue;
    seen.add(current);
    if (isRelationshipCommandDiagnostic(current.diagnostic)) return current.diagnostic;
    if (
      current.reason === 'relation_constraint_rejected' &&
      isRelationConstraintRejection(current.rejection)
    ) {
      return relationshipConstraintDiagnostic(current.rejection);
    }
    if (
      current.reason === 'relationship_precondition_failed' &&
      command.kind === 'relationship-command'
    ) {
      return relationshipPreconditionDiagnostic(command);
    }
    for (const key of Reflect.ownKeys(current)) {
      const nested = current[key as keyof typeof current];
      if (isRecord(nested) && !seen.has(nested)) pending.push(nested);
    }
  }
  return undefined;
};
