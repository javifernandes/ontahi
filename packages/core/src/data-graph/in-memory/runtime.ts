import { Effect, Stream } from 'effect';

import type { GraphCommandSpec } from '../command.js';
import type { AnyEntityDefinition } from '../definitions.js';
import type { EntityMutationCommandExecutionRuntime } from '../entity-mutation-command.js';
import {
  resolveQuerySpec,
  type PlainGraphRead,
  type QueryOrView,
  type QuerySpec,
} from '../query.js';
import { getEntityIdentityLocator } from '../ref/index.js';
import {
  liftEntityReferenceFieldValues,
  normalizeEntityReferenceJoinValue,
} from '../reference-field.js';
import {
  isRelatedRootReadSpec,
  resolveRelatedRootFields,
  type RelatedRootReadMode,
  type RelatedRootReadSpec,
} from '../relation-root.js';
import type {
  ManyToManyRelationshipCommandExecutionRuntime,
  RelationshipCommandExecutionRuntime,
  RelationshipFact,
} from '../relationship-command.js';
import type { DataGraphExecutionRuntime } from '../runtime.js';
import { selectionAnd } from '../selection-ast.js';
import type { DataGraphTransactionCapability } from '../transaction.js';

import { executeInMemoryGraphCommandEffect, InMemoryDataGraphError } from './command.js';
import { executeInMemoryEntityMutationCommandEffect } from './entity-mutation-command.js';
import { executeInMemoryManyToManyRelationshipCommandEffect } from './many-to-many-relationship-command.js';
import {
  materializeDerivedFields,
  materializeRecord,
  type InMemoryDataset,
} from './materialization.js';
import { applyEntitySelectionExpression, applyOrder } from './query.js';
import { executeInMemoryRelationshipCommandEffect } from './relationship-command.js';

const selectRows = (
  spec: QuerySpec<any, any>,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[] = [],
  options?: { applyLimit?: boolean },
) => {
  const candidateRows = (dataset[spec.root.name] ?? []).map(row =>
    materializeDerivedFields(row, spec.root, dataset, relationships),
  );
  const rows = applyOrder(
    applyEntitySelectionExpression(spec.root, candidateRows, spec.selection),
    spec.orderBy,
  );

  return options?.applyLimit === false
    ? rows
    : rows.slice(0, spec.limit ?? Number.POSITIVE_INFINITY);
};

const materializeRows = <TResult>(
  spec: QuerySpec<any, TResult>,
  rows: ReadonlyArray<Record<string, unknown>>,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[] = [],
  options?: { entityRows?: boolean },
) =>
  rows.map(row =>
    materializeRecord(
      row,
      spec.root,
      options?.entityRows ? undefined : spec.select,
      options?.entityRows ? undefined : spec.includes,
      dataset,
      relationships,
    ),
  ) as TResult[];

const executePlainRead = <TParams, TResult>(
  queryOrView: PlainGraphRead<TParams, TResult>,
  params: TParams,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[] = [],
  options?: { entityRows?: boolean },
) => {
  const spec = resolveQuerySpec(queryOrView, params);

  const rows = materializeRows(
    spec,
    selectRows(spec, dataset, relationships),
    dataset,
    relationships,
    options,
  );
  if (spec.cardinality === 'one' && rows.length !== 1) {
    throw new InMemoryDataGraphError(
      `Expected exactly one ${spec.root.name}, received ${rows.length}.`,
      'cardinality_mismatch',
    );
  }
  return rows;
};

const uniqueNonNullValues = (
  rows: Array<Record<string, unknown>>,
  entity: AnyEntityDefinition,
  field: string,
) => [
  ...new Set(
    rows
      .map(row => normalizeEntityReferenceJoinValue(entity, field, row[field]))
      .filter(value => value != null),
  ),
];

const withRelatedTargetPredicate = (
  spec: RelatedRootReadSpec,
  targetField: string,
  sourceValues: readonly unknown[],
): QuerySpec<any, any> => {
  const values = liftEntityReferenceFieldValues(spec.target.root, targetField, sourceValues);
  return {
    ...spec.target,
    selection: selectionAnd(spec.target.selection, {
      kind: 'predicate',
      operator: 'in',
      fieldName: targetField,
      values,
    }),
  };
};

const emptyRelatedRootResult = <TResult>(mode: RelatedRootReadMode, sourceRows: unknown[]) => {
  if (mode === 'resolve') return [{ sourceRows, rows: [] }] as TResult[];
  if (mode === 'countBySource') {
    return [{ sourceRows, countsBySource: new Map<unknown, number>() }] as TResult[];
  }

  return [] as TResult[];
};

const countRowsBySource = (
  sourceValues: readonly unknown[],
  rows: Array<Record<string, unknown>>,
  targetEntity: AnyEntityDefinition,
  targetField: string,
) => {
  const counts = new Map<unknown, number>(sourceValues.map(value => [value, 0]));

  for (const row of rows) {
    const value = normalizeEntityReferenceJoinValue(targetEntity, targetField, row[targetField]);
    if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
};

const executeEntityRows = (
  read: QueryOrView<any, any>,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[] = [],
): Array<Record<string, unknown>> =>
  isRelatedRootReadSpec(read)
    ? (executeRelatedRootRead(
        {
          ...read,
          mode: 'entityRows',
        },
        dataset,
        relationships,
      ) as Array<Record<string, unknown>>)
    : executePlainRead(read as PlainGraphRead<any, any>, undefined, dataset, relationships, {
        entityRows: true,
      });

const executeRelatedRootRead = <TResult>(
  spec: RelatedRootReadSpec<any, any, TResult, any, any>,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[] = [],
): TResult[] => {
  const relationEntity = spec.relationOwner === 'source' ? spec.sourceEntity : spec.target.root;
  const relationDefinition = relationEntity.relations[spec.relationName];
  if (relationDefinition?.relationKind === 'manyToMany') {
    const sourceEntityRows = executeEntityRows(spec.source, dataset, relationships);
    const sourceRows =
      spec.mode === 'resolve' || spec.mode === 'countBySource'
        ? executeRead(spec.source, undefined, dataset, relationships)
        : sourceEntityRows;
    const sourceIdentityFields = getEntityIdentityLocator(spec.sourceEntity)?.locator.fields ?? [];
    const targetIdentityFields = getEntityIdentityLocator(spec.target.root)?.locator.fields ?? [];
    if (sourceIdentityFields.length === 0 || targetIdentityFields.length === 0) {
      throw new Error(
        `Relation ${relationEntity.name}.${spec.relationName} requires identities on both Entities.`,
      );
    }

    const rowKey = (row: Record<string, unknown>, fields: readonly string[]) =>
      JSON.stringify(fields.map(field => row[field]));
    const refKey = (ref: RelationshipFact['source'], fields: readonly string[]) =>
      JSON.stringify(fields.map(field => ref.locator[field]));
    const sourceKeys = new Set(sourceEntityRows.map(row => rowKey(row, sourceIdentityFields)));
    const canonicalRelation = {
      sourceEntityName: relationEntity.name,
      relationName: spec.relationName,
      targetEntityName: relationDefinition.target.name,
    };
    const canonicalFacts = relationships.filter(
      fact =>
        'cardinality' in fact.relation &&
        fact.relation.cardinality === 'many-to-many' &&
        fact.relation.sourceEntityName === canonicalRelation.sourceEntityName &&
        fact.relation.relationName === canonicalRelation.relationName &&
        fact.relation.targetEntityName === canonicalRelation.targetEntityName,
    );
    const relatedTargetKeys = new Set(
      canonicalFacts
        .filter(fact => {
          const selectedSource = spec.relationOwner === 'source' ? fact.source : fact.target;
          return sourceKeys.has(refKey(selectedSource, sourceIdentityFields));
        })
        .map(fact => {
          const relatedTarget = spec.relationOwner === 'source' ? fact.target : fact.source;
          return refKey(relatedTarget, targetIdentityFields);
        }),
    );
    const targetRows = selectRows(spec.target, dataset, relationships, { applyLimit: false })
      .filter(row => relatedTargetKeys.has(rowKey(row, targetIdentityFields)))
      .slice(0, spec.target.limit ?? Number.POSITIVE_INFINITY);
    const entityRows = materializeRows<Record<string, unknown>>(
      spec.target,
      targetRows,
      dataset,
      relationships,
      { entityRows: true },
    );
    const selectedTargetKeys = new Set(entityRows.map(row => rowKey(row, targetIdentityFields)));

    if (spec.mode === 'entityRows') return entityRows as TResult[];
    const rows = materializeRows<TResult>(spec.target, targetRows, dataset, relationships);
    if (spec.mode === 'resolve') return [{ sourceRows, rows }] as TResult[];
    if (spec.mode === 'countBySource') {
      return [
        {
          sourceRows,
          countsBySource: new Map(
            sourceEntityRows.map(row => {
              const key =
                sourceIdentityFields.length === 1
                  ? row[sourceIdentityFields[0]!]
                  : rowKey(row, sourceIdentityFields);
              const count = canonicalFacts.filter(fact => {
                const selectedSource = spec.relationOwner === 'source' ? fact.source : fact.target;
                const selectedTarget = spec.relationOwner === 'source' ? fact.target : fact.source;
                return (
                  refKey(selectedSource, sourceIdentityFields) ===
                    rowKey(row, sourceIdentityFields) &&
                  selectedTargetKeys.has(refKey(selectedTarget, targetIdentityFields))
                );
              }).length;
              return [key, count];
            }),
          ),
        },
      ] as TResult[];
    }
    return rows;
  }

  const { sourceField, targetField } = resolveRelatedRootFields(
    spec.target.root,
    spec.sourceEntity,
    spec.relationName,
    spec.relationOwner,
  );
  const sourceEntityRows = executeEntityRows(spec.source, dataset, relationships);
  const sourceRows =
    spec.mode === 'resolve' || spec.mode === 'countBySource'
      ? executeRead(spec.source, undefined, dataset, relationships)
      : sourceEntityRows;
  const sourceValues = uniqueNonNullValues(sourceEntityRows, spec.sourceEntity, sourceField);

  if (sourceEntityRows.length === 0 || sourceValues.length === 0) {
    return emptyRelatedRootResult(spec.mode, sourceRows);
  }

  const targetSpec = withRelatedTargetPredicate(spec, targetField, sourceValues);
  const targetRows = selectRows(targetSpec, dataset, relationships);
  const entityRows = materializeRows<Record<string, unknown>>(
    targetSpec,
    targetRows,
    dataset,
    relationships,
    { entityRows: true },
  );

  if (spec.mode === 'entityRows') return entityRows as TResult[];
  if (spec.mode === 'countBySource') {
    return [
      {
        sourceRows,
        countsBySource: countRowsBySource(sourceValues, entityRows, spec.target.root, targetField),
      },
    ] as TResult[];
  }

  const rows = materializeRows<TResult>(targetSpec, targetRows, dataset, relationships);
  return spec.mode === 'resolve' ? ([{ sourceRows, rows }] as TResult[]) : rows;
};

const executeRead = <TParams, TResult>(
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[] = [],
): TResult[] =>
  isRelatedRootReadSpec(queryOrView)
    ? (executeRelatedRootRead(queryOrView, dataset, relationships) as TResult[])
    : executePlainRead(
        queryOrView as PlainGraphRead<TParams, TResult>,
        params,
        dataset,
        relationships,
      );

const countRead = <TParams, TResult>(
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[] = [],
) => {
  if (!isRelatedRootReadSpec(queryOrView)) {
    const spec = resolveQuerySpec(queryOrView as PlainGraphRead<TParams, TResult>, params);
    const count = selectRows(spec, dataset, relationships, { applyLimit: false }).length;
    if (spec.cardinality === 'one' && count !== 1) {
      throw new InMemoryDataGraphError(
        `Expected exactly one ${spec.root.name}, received ${count}.`,
        'cardinality_mismatch',
      );
    }
    return count;
  }

  const relationEntity =
    queryOrView.relationOwner === 'source' ? queryOrView.sourceEntity : queryOrView.target.root;
  if (relationEntity.relations[queryOrView.relationName]?.relationKind === 'manyToMany') {
    return executeRelatedRootRead(
      {
        ...queryOrView,
        mode: 'entityRows',
        target: { ...queryOrView.target, limit: undefined },
      },
      dataset,
      relationships,
    ).length;
  }

  const { sourceField, targetField } = resolveRelatedRootFields(
    queryOrView.target.root,
    queryOrView.sourceEntity,
    queryOrView.relationName,
    queryOrView.relationOwner,
  );
  const sourceValues = uniqueNonNullValues(
    executeEntityRows(queryOrView.source, dataset, relationships),
    queryOrView.sourceEntity,
    sourceField,
  );

  if (sourceValues.length === 0) return 0;

  return selectRows(
    withRelatedTargetPredicate(queryOrView, targetField, sourceValues),
    dataset,
    relationships,
    {
      applyLimit: false,
    },
  ).length;
};

export type InMemoryDataGraphRuntime = DataGraphExecutionRuntime<
  InMemoryDataGraphError,
  undefined,
  undefined,
  InMemoryDataGraphError
> &
  EntityMutationCommandExecutionRuntime<InMemoryDataGraphError> &
  ManyToManyRelationshipCommandExecutionRuntime<InMemoryDataGraphError> &
  RelationshipCommandExecutionRuntime<InMemoryDataGraphError> &
  DataGraphTransactionCapability<InMemoryDataGraphRuntime>;

export const createInMemoryDataGraphRuntime = (input: {
  dataset: InMemoryDataset;
  entities?: readonly AnyEntityDefinition[];
  relationships?: RelationshipFact[];
}): InMemoryDataGraphRuntime => {
  const relationships = input.relationships ?? [];
  input.relationships = relationships;
  return {
    get: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.try({
        try: () => executeRead(queryOrView, params, input.dataset, relationships)[0] ?? null,
        catch: cause =>
          cause instanceof InMemoryDataGraphError
            ? cause
            : new InMemoryDataGraphError('Failed to execute in-memory read.', 'read_failed', cause),
      }),
    run: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.try({
        try: () => executeRead(queryOrView, params, input.dataset, relationships),
        catch: cause =>
          cause instanceof InMemoryDataGraphError
            ? cause
            : new InMemoryDataGraphError('Failed to execute in-memory read.', 'read_failed', cause),
      }),
    stream: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Stream.fromEffect(
        Effect.try({
          try: () => executeRead(queryOrView, params, input.dataset, relationships),
          catch: cause =>
            cause instanceof InMemoryDataGraphError
              ? cause
              : new InMemoryDataGraphError(
                  'Failed to execute in-memory read.',
                  'read_failed',
                  cause,
                ),
        }),
      ).pipe(Stream.flatMap(Stream.fromIterable)),
    count: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.try({
        try: () => countRead(queryOrView, params, input.dataset, relationships),
        catch: cause =>
          cause instanceof InMemoryDataGraphError
            ? cause
            : new InMemoryDataGraphError('Failed to count in-memory read.', 'read_failed', cause),
      }),
    runCommand: <TResult>(command: GraphCommandSpec<any, any, TResult>) =>
      executeInMemoryGraphCommandEffect(input.dataset, command),
    runEntityMutationCommand: command =>
      executeInMemoryEntityMutationCommandEffect(input.dataset, input.entities ?? [], command),
    runManyToManyRelationshipCommand: command =>
      executeInMemoryManyToManyRelationshipCommandEffect(
        input.dataset,
        input.entities ?? [],
        relationships,
        command,
      ),
    runRelationshipCommand: command =>
      executeInMemoryRelationshipCommandEffect(input.dataset, input.entities ?? [], command),
    transaction: work =>
      Effect.suspend(() => {
        const transactionDataset = structuredClone(input.dataset) as InMemoryDataset;
        const transactionRelationships = structuredClone(relationships) as RelationshipFact[];
        const transactionRuntime = createInMemoryDataGraphRuntime({
          dataset: transactionDataset,
          entities: input.entities,
          relationships: transactionRelationships,
        });

        return work(transactionRuntime).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              for (const entityName of Object.keys(input.dataset)) {
                delete input.dataset[entityName];
              }
              Object.assign(input.dataset, transactionDataset);
              relationships.splice(0, relationships.length, ...transactionRelationships);
            }),
          ),
        );
      }),
  } satisfies InMemoryDataGraphRuntime;
};
