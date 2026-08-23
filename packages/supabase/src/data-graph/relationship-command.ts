import {
  compileSelectionExpression,
  getEntityMapping,
  isReferenceFieldDefinition,
  liftEntityReferenceValue,
  lowerEntityReferenceValue,
  resolveHasManyTargetField,
  selectionReferences,
  type AnyEntityDefinition,
  type RelationshipCommand,
  type RelationshipDelta,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';

import type { SupabaseErrorFactory, SupabaseLikeClient } from './types.js';

export const DEFAULT_SUPABASE_RELATIONSHIP_RPC = 'ontahi_apply_relationship';

export type SupabaseRelationshipRpcPayload = {
  version: 1;
  action: 'link' | 'unlink';
  source: { table: string; selection: unknown };
  target: { table: string; selection: unknown };
  relationColumn: string;
  nextTarget: unknown;
  expectedCurrent?: unknown;
};

type ResolvedDirectRelation = {
  source: AnyEntityDefinition;
  target: AnyEntityDefinition;
  field: ReturnType<typeof resolveReferenceField>;
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
  const constrained = [source, target].some(declaringEntity =>
    Object.entries(declaringEntity.relations).some(([relationName, relation]) => {
      if ((relation.constraints?.length ?? 0) === 0) return false;
      if (
        relation.relationKind === 'belongsTo' &&
        declaringEntity.name === source.name &&
        relation.target.name === target.name &&
        (relation.sourceField ?? relationName) === command.relation.fieldName
      ) {
        return true;
      }
      if (
        relation.relationKind === 'hasMany' &&
        declaringEntity.name === target.name &&
        relation.target.name === source.name
      ) {
        const targetField = resolveHasManyTargetField(declaringEntity, relation);
        if (!targetField) {
          throw new Error(
            `Supabase Relationship Command cannot resolve constrained inverse Relation ${declaringEntity.name}.${relationName}.`,
          );
        }
        return targetField === command.relation.fieldName;
      }
      return false;
    }),
  );
  if (constrained) {
    throw new Error('Supabase Relationship Commands do not yet compile Relation constraints.');
  }
  return { source, target, field };
};

export const compileSupabaseRelationshipRpcPayload = (
  command: RelationshipCommand,
  entities: readonly AnyEntityDefinition[],
): SupabaseRelationshipRpcPayload => {
  const { source, target, field } = resolveDirectRelation(command, entities);
  const expected =
    command.precondition?.currentTarget ??
    (command.action === 'unlink' ? command.target : undefined);
  return {
    version: 1,
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
  };
};

type SupabaseRelationshipRpcResult = {
  sourceCount: number;
  targetCount: number;
  oldTarget: unknown;
  preconditionMatched: boolean;
  changed: boolean;
};

const isRpcResult = (value: unknown): value is SupabaseRelationshipRpcResult => {
  const result = value as Partial<SupabaseRelationshipRpcResult> | null;
  return (
    result != null &&
    Number.isInteger(result.sourceCount) &&
    Number.isInteger(result.targetCount) &&
    typeof result.preconditionMatched === 'boolean' &&
    typeof result.changed === 'boolean' &&
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
): Effect.Effect<RelationshipDelta, TError> =>
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
    if (response.error || !isRpcResult(response.data)) {
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
      return yield* Effect.fail(
        deps.createError({
          message: 'Supabase Relationship current target did not match its precondition',
          logMessage: 'Supabase Relationship precondition failed',
          cause: 'relationship_precondition_failed',
        }),
      );
    }
    return materializeDelta(command, deps.entities, response.data);
  });
