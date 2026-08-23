import {
  compileSelectionExpression,
  createEntityIdentityRef,
  getEntityIdentityLocator,
  getEntityMapping,
  resolveManyToManyRelationConstraints,
  type ManyToManyRelationshipCommand,
  type RelationConstraintRejection,
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

export const DEFAULT_SUPABASE_MANY_TO_MANY_RPC = 'ontahi_apply_many_to_many_relationship';

export type SupabaseManyToManyRpcPayload = {
  version: 1 | 2;
  action: 'link' | 'unlink';
  source: { table: string; column: string; selection: unknown; expectedCount?: number };
  target: { table: string; column: string; selection: unknown; expectedCount?: number };
  edge: { table: string; sourceColumn: string; targetColumn: string };
  constraints?: readonly SupabaseRelationParticipantConstraint[];
};

const explicitReferenceCount = (selection: ManyToManyRelationshipCommand['sources']['selection']) =>
  selection.kind === 'references'
    ? new Set(selection.refs.map(ref => JSON.stringify(ref.locator))).size
    : undefined;

const identityField = (entity: Parameters<typeof getEntityMapping>[0]) => {
  const fields = getEntityIdentityLocator(entity)?.locator.fields;
  if (fields?.length !== 1) {
    throw new Error(
      `Supabase many-to-many Relation requires one identity field on ${entity.name}.`,
    );
  }
  return fields[0]!;
};

export const compileSupabaseManyToManyRpcPayload = (
  command: ManyToManyRelationshipCommand,
  entities: readonly Parameters<typeof getEntityMapping>[0][],
): SupabaseManyToManyRpcPayload => {
  const source = entities.find(entity => entity.name === command.relation.sourceEntityName);
  const target = entities.find(entity => entity.name === command.relation.targetEntityName);
  if (!source || !target) {
    throw new Error('Supabase many-to-many Command references an unknown Entity.');
  }
  const relation = source.relations[command.relation.relationName];
  if (
    relation?.relationKind !== 'manyToMany' ||
    relation.target !== target ||
    relation.mapping?.type !== 'many-to-many'
  ) {
    throw new Error(
      `Supabase many-to-many Relation ${source.name}.${command.relation.relationName} is not mapped.`,
    );
  }
  const sourceMapping = getEntityMapping(source);
  const targetMapping = getEntityMapping(target);
  const sourceField = identityField(source);
  const targetField = identityField(target);
  if (
    sourceMapping.tableName !== relation.mapping.fromTable ||
    sourceMapping.columns[sourceField] !== relation.mapping.fromColumn ||
    targetMapping.tableName !== relation.mapping.toTable ||
    targetMapping.columns[targetField] !== relation.mapping.toColumn
  ) {
    throw new Error('Supabase many-to-many Relation mapping does not match Entity mappings.');
  }
  const sourceExpected = explicitReferenceCount(command.sources.selection);
  const targetExpected = explicitReferenceCount(command.targets.selection);
  const constraints =
    command.action === 'link'
      ? compileSupabaseRelationConstraints(
          resolveManyToManyRelationConstraints(relation, source, target),
        )
      : [];
  return {
    version: constraints.length === 0 ? 1 : 2,
    action: command.action,
    source: {
      table: relation.mapping.fromTable,
      column: relation.mapping.fromColumn,
      selection: compileSelectionExpression(source, command.sources.selection),
      ...(sourceExpected === undefined ? {} : { expectedCount: sourceExpected }),
    },
    target: {
      table: relation.mapping.toTable,
      column: relation.mapping.toColumn,
      selection: compileSelectionExpression(target, command.targets.selection),
      ...(targetExpected === undefined ? {} : { expectedCount: targetExpected }),
    },
    edge: {
      table: relation.mapping.throughTable,
      sourceColumn: relation.mapping.throughFromColumn,
      targetColumn: relation.mapping.throughToColumn,
    },
    ...(constraints.length === 0 ? {} : { constraints }),
  };
};

type SupabaseManyToManyRpcResult = {
  sourceCount: number;
  targetCount: number;
  changed: Array<{ source: unknown; target: unknown }>;
  constraintRejection?: RelationConstraintRejection | null;
};

const isRpcResult = (value: unknown): value is SupabaseManyToManyRpcResult => {
  const result = value as Partial<SupabaseManyToManyRpcResult> | null;
  return (
    result != null &&
    Number.isInteger(result.sourceCount) &&
    Number.isInteger(result.targetCount) &&
    (!('constraintRejection' in result) ||
      result.constraintRejection == null ||
      isRelationConstraintRejection(result.constraintRejection)) &&
    Array.isArray(result.changed)
  );
};

export const executeSupabaseManyToManyRelationshipCommandEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TOptions extends object,
>(
  deps: {
    getClient: (options?: TOptions) => Effect.Effect<TClient, TError>;
    createError: SupabaseErrorFactory<TError>;
    entities: readonly Parameters<typeof getEntityMapping>[0][];
    rpcName?: string;
  },
  command: ManyToManyRelationshipCommand,
  options?: TOptions,
): Effect.Effect<RelationshipDelta, TError> =>
  Effect.gen(function* () {
    const client = yield* deps.getClient(options);
    if (!client.rpc) {
      return yield* Effect.fail(
        deps.createError({
          message: 'Supabase client does not expose the Ontahi many-to-many RPC capability',
          logMessage: 'Missing Supabase many-to-many RPC capability',
          cause: 'unsupported_many_to_many_rpc',
        }),
      );
    }
    const payload = yield* Effect.try({
      try: () => compileSupabaseManyToManyRpcPayload(command, deps.entities),
      catch: cause =>
        deps.createError({
          message: 'Invalid Supabase many-to-many Command',
          logMessage: 'Invalid Supabase many-to-many Command',
          cause,
        }),
    });
    const response = yield* Effect.tryPromise({
      try: () =>
        Promise.resolve(
          client.rpc!(deps.rpcName ?? DEFAULT_SUPABASE_MANY_TO_MANY_RPC, { command: payload }),
        ),
      catch: cause =>
        deps.createError({
          message: 'Supabase many-to-many Command failed',
          logMessage: 'Supabase many-to-many RPC failed',
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
          message: 'Supabase many-to-many Command failed',
          logMessage: 'Supabase many-to-many RPC returned an invalid result',
          cause: response.error?.message ?? response.data,
        }),
      );
    }
    if (
      (payload.source.expectedCount !== undefined &&
        response.data.sourceCount !== payload.source.expectedCount) ||
      (payload.target.expectedCount !== undefined &&
        response.data.targetCount !== payload.target.expectedCount)
    ) {
      return yield* Effect.fail(
        deps.createError({
          message: 'Supabase many-to-many endpoint Ref did not resolve exactly once',
          logMessage: 'Supabase many-to-many endpoint cardinality mismatch',
          cause: 'cardinality_mismatch',
        }),
      );
    }
    if (response.data.constraintRejection) {
      return yield* Effect.fail(
        deps.createError({
          message: response.data.constraintRejection.message,
          logMessage: 'Supabase many-to-many Relation constraint rejected',
          cause: relationConstraintRejectionCause(response.data.constraintRejection),
        }),
      );
    }
    const source = deps.entities.find(entity => entity.name === command.relation.sourceEntityName)!;
    const target = deps.entities.find(entity => entity.name === command.relation.targetEntityName)!;
    const sourceField = identityField(source);
    const targetField = identityField(target);
    const facts = response.data.changed.map(change => ({
      relation: command.relation,
      source: createEntityIdentityRef(source, { [sourceField]: change.source })!,
      target: createEntityIdentityRef(target, { [targetField]: change.target })!,
    }));
    return command.action === 'link'
      ? { added: facts, removed: [] }
      : { added: [], removed: facts };
  });
