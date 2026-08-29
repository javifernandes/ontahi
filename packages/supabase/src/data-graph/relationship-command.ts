import {
  appliedRelationshipCommand,
  compileSelectionExpression,
  getEntityMapping,
  isReferenceFieldDefinition,
  liftEntityReferenceValue,
  lowerEntityReferenceValue,
  notAppliedRelationshipCommand,
  resolveDirectRelationCountConstraints,
  resolveDirectRelationConstraints,
  selectionReferences,
  type AnyEntityDefinition,
  type RelationConstraintRejection,
  type RelationshipCommand,
  type RelationshipCommandResult,
  type RelationshipDelta,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';

import {
  compileSupabaseRelationConstraints,
  isRelationConstraintRejection,
  relationConstraintRejectionCause,
  type SupabaseRelationParticipantConstraint,
} from './relation-constraint.js';
import type { SupabaseErrorFactory, SupabaseLikeClient } from './types.js';

export const DEFAULT_SUPABASE_RELATIONSHIP_RPC = 'ontahi_apply_relationship';

export type SupabaseRelationshipRpcPayload = {
  version: 1 | 2;
  action: 'link' | 'unlink';
  source: { table: string; selection: unknown };
  target: { table: string; selection: unknown };
  relationColumn: string;
  nextTarget: unknown;
  expectedCurrent?: unknown;
  constraints?: readonly SupabaseRelationParticipantConstraint[];
};

type ResolvedDirectRelation = {
  source: AnyEntityDefinition;
  target: AnyEntityDefinition;
  field: ReturnType<typeof resolveReferenceField>;
  constraints: readonly SupabaseRelationParticipantConstraint[];
};

const resolveReferenceField = (source: AnyEntityDefinition, command: RelationshipCommand) => {
  const field = source.fields[command.relation.fieldName];
  if (!field || !isReferenceFieldDefinition(field)) {
    throw new Error('Supabase Relationship Command does not reference a Reference Field.');
  }
  return field;
};

const resolveDirectRelation = (
  command: RelationshipCommand,
  entities: readonly AnyEntityDefinition[],
): ResolvedDirectRelation => {
  const source = entities.find(entity => entity.name === command.relation.sourceEntityName);
  const target = entities.find(entity => entity.name === command.relation.targetEntityName);
  if (!source || !target) {
    throw new Error('Supabase Relationship Command references an unknown Entity.');
  }
  const field = resolveReferenceField(source, command);
  if (field.target.name !== target.name) {
    throw new Error('Supabase Relationship Command target does not match its Reference Field.');
  }
  if (command.action === 'unlink' && !command.target && !field.nullable && !field.optional) {
    throw new Error('Supabase Relationship Command cannot clear a required Relation.');
  }
  let constraints: readonly SupabaseRelationParticipantConstraint[];
  try {
    const countConstraints =
      command.action === 'link'
        ? resolveDirectRelationCountConstraints(command.relation, source, target)
        : [];
    if (countConstraints.length > 0) {
      throw new Error('does not support authority-serialized Relation count constraints.');
    }
    constraints =
      command.action === 'link'
        ? compileSupabaseRelationConstraints(
            resolveDirectRelationConstraints(command.relation, source, target),
          )
        : [];
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Cannot resolve Relation constraints.';
    throw new Error(
      `Supabase Relationship Command ${message.charAt(0).toLowerCase()}${message.slice(1)}`,
    );
  }
  return { source, target, field, constraints };
};

export const compileSupabaseRelationshipRpcPayload = (
  command: RelationshipCommand,
  entities: readonly AnyEntityDefinition[],
): SupabaseRelationshipRpcPayload => {
  const { source, target, field, constraints } = resolveDirectRelation(command, entities);
  const expected =
    command.precondition?.currentTarget ??
    (command.action === 'unlink' ? command.target : undefined);
  return {
    version: constraints.length === 0 ? 1 : 2,
    action: command.action,
    source: {
      table: getEntityMapping(source).tableName,
      selection: compileSelectionExpression(source, selectionReferences([command.source])),
    },
    target: {
      table: getEntityMapping(target).tableName,
      selection: command.target
        ? compileSelectionExpression(target, selectionReferences([command.target]))
        : { kind: 'none' },
    },
    relationColumn: getEntityMapping(source).columns[command.relation.fieldName]!,
    nextTarget: command.action === 'link' ? lowerEntityReferenceValue(field, command.target) : null,
    ...(expected === undefined
      ? {}
      : { expectedCurrent: lowerEntityReferenceValue(field, expected) }),
    ...(constraints.length === 0 ? {} : { constraints }),
  };
};

type SupabaseRelationshipRpcResult = {
  sourceCount: number;
  targetCount: number;
  oldTarget: unknown;
  preconditionMatched: boolean;
  changed: boolean;
  constraintRejection?: RelationConstraintRejection | null;
};

const isRpcResult = (value: unknown): value is SupabaseRelationshipRpcResult => {
  const result = value as Partial<SupabaseRelationshipRpcResult> | null;
  return (
    result != null &&
    Number.isInteger(result.sourceCount) &&
    Number.isInteger(result.targetCount) &&
    typeof result.preconditionMatched === 'boolean' &&
    typeof result.changed === 'boolean' &&
    (!('constraintRejection' in result) ||
      result.constraintRejection == null ||
      isRelationConstraintRejection(result.constraintRejection)) &&
    'oldTarget' in result
  );
};

const materializeDelta = (
  command: RelationshipCommand,
  entities: readonly AnyEntityDefinition[],
  result: SupabaseRelationshipRpcResult,
): RelationshipDelta => {
  if (!result.changed) return { added: [], removed: [] };
  const { field } = resolveDirectRelation(command, entities);
  const previous =
    result.oldTarget == null ? undefined : liftEntityReferenceValue(field, result.oldTarget);
  const fact = (target: NonNullable<RelationshipCommand['target']>) => ({
    relation: command.relation,
    source: command.source,
    target,
  });
  return {
    added:
      command.action === 'link' &&
      command.target &&
      result.oldTarget !== lowerEntityReferenceValue(field, command.target)
        ? [fact(command.target)]
        : [],
    removed:
      previous &&
      (command.action === 'unlink' ||
        !command.target ||
        result.oldTarget !== lowerEntityReferenceValue(field, command.target))
        ? [fact(previous)]
        : [],
  };
};

export const executeSupabaseRelationshipCommandEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TOptions extends object,
>(
  deps: {
    getClient: (options?: TOptions) => Effect.Effect<TClient, TError>;
    createError: SupabaseErrorFactory<TError>;
    entities: readonly AnyEntityDefinition[];
    rpcName?: string;
  },
  command: RelationshipCommand,
  options?: TOptions,
): Effect.Effect<RelationshipCommandResult, TError> =>
  Effect.gen(function* () {
    const client = yield* deps.getClient(options);
    if (!client.rpc) {
      return yield* Effect.fail(
        deps.createError({
          message: 'Supabase client does not expose the Ontahi Relationship RPC capability',
          logMessage: 'Missing Supabase Relationship RPC capability',
          cause: 'unsupported_relationship_rpc',
        }),
      );
    }
    const payload = yield* Effect.try({
      try: () => compileSupabaseRelationshipRpcPayload(command, deps.entities),
      catch: cause =>
        deps.createError({
          message: 'Invalid Supabase Relationship Command',
          logMessage: 'Invalid Supabase Relationship Command',
          cause,
        }),
    });
    const response = yield* Effect.tryPromise({
      try: () =>
        Promise.resolve(
          client.rpc!(deps.rpcName ?? DEFAULT_SUPABASE_RELATIONSHIP_RPC, { command: payload }),
        ),
      catch: cause =>
        deps.createError({
          message: 'Supabase Relationship Command failed',
          logMessage: 'Supabase Relationship RPC failed',
          cause,
        }),
    });
    if (
      response.error ||
      !isRpcResult(response.data) ||
      (payload.version === 2 && !('constraintRejection' in response.data))
    ) {
      return yield* Effect.fail(
        deps.createError({
          message: 'Supabase Relationship Command failed',
          logMessage: 'Supabase Relationship RPC returned an invalid result',
          cause: response.error?.message ?? response.data,
        }),
      );
    }
    if (
      response.data.sourceCount !== 1 ||
      (command.action === 'link' && response.data.targetCount !== 1)
    ) {
      return yield* Effect.fail(
        deps.createError({
          message: 'Supabase Relationship endpoint Ref did not resolve exactly once',
          logMessage: 'Supabase Relationship endpoint cardinality mismatch',
          cause: 'cardinality_mismatch',
        }),
      );
    }
    if (command.precondition && !response.data.preconditionMatched) {
      if (command.precondition.onMismatch === 'skip') {
        return notAppliedRelationshipCommand(command);
      }
      return yield* Effect.fail(
        deps.createError({
          message: 'Supabase Relationship current target did not match its precondition',
          logMessage: 'Supabase Relationship precondition failed',
          cause: { reason: 'relationship_precondition_failed' },
        }),
      );
    }
    if (response.data.constraintRejection) {
      return yield* Effect.fail(
        deps.createError({
          message: response.data.constraintRejection.message,
          logMessage: 'Supabase Relationship constraint rejected',
          cause: relationConstraintRejectionCause(response.data.constraintRejection),
        }),
      );
    }
    return appliedRelationshipCommand(materializeDelta(command, deps.entities, response.data));
  });
