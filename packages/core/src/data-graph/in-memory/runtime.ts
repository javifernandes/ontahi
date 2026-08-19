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

import { executeInMemoryGraphCommandEffect, InMemoryDataGraphError } from './command.js';
import { executeInMemoryEntityMutationCommandEffect } from './entity-mutation-command.js';
import { executeInMemoryManyToManyRelationshipCommandEffect } from './many-to-many-relationship-command.js';
import { materializeRecord, type InMemoryDataset } from './materialization.js';
import { applyEntitySelectionExpression, applyOrder } from './query.js';
import { executeInMemoryRelationshipCommandEffect } from './relationship-command.js';

const selectRows = (
  spec: QuerySpec<any, any>,
  dataset: InMemoryDataset,
  options?: { applyLimit?: boolean },
) => {
  const rows = applyOrder(
    applyEntitySelectionExpression(spec.root, dataset[spec.root.name] ?? [], spec.selection),
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
  options?: { entityRows?: boolean },
) =>
  rows.map(row =>
    materializeRecord(
      row,
      spec.root,
      options?.entityRows ? undefined : spec.select,
      options?.entityRows ? undefined : spec.includes,
      dataset,
    ),
  ) as TResult[];

const executePlainRead = <TParams, TResult>(
  queryOrView: PlainGraphRead<TParams, TResult>,
  params: TParams,
  dataset: InMemoryDataset,
  options?: { entityRows?: boolean },
) => {
  const spec = resolveQuerySpec(queryOrView, params);

  const rows = materializeRows(spec, selectRows(spec, dataset), dataset, options);
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
): Array<Record<string, unknown>> =>
  isRelatedRootReadSpec(read)
    ? (executeRelatedRootRead(
        {
          ...read,
          mode: 'entityRows',
        },
        dataset,
      ) as Array<Record<string, unknown>>)
    : executePlainRead(read as PlainGraphRead<any, any>, undefined, dataset, {
        entityRows: true,
      });

const executeRelatedRootRead = <TResult>(
  spec: RelatedRootReadSpec<any, any, TResult, any, any>,
  dataset: InMemoryDataset,
): TResult[] => {
  const { sourceField, targetField } = resolveRelatedRootFields(
    spec.target.root,
    spec.sourceEntity,
    spec.relationName,
    spec.relationOwner,
  );
  const sourceEntityRows = executeEntityRows(spec.source, dataset);
  const sourceRows =
    spec.mode === 'resolve' || spec.mode === 'countBySource'
      ? executeRead(spec.source, undefined, dataset)
      : sourceEntityRows;
  const sourceValues = uniqueNonNullValues(sourceEntityRows, spec.sourceEntity, sourceField);

  if (sourceEntityRows.length === 0 || sourceValues.length === 0) {
    return emptyRelatedRootResult(spec.mode, sourceRows);
  }

  const targetSpec = withRelatedTargetPredicate(spec, targetField, sourceValues);
  const targetRows = selectRows(targetSpec, dataset);
  const entityRows = materializeRows<Record<string, unknown>>(targetSpec, targetRows, dataset, {
    entityRows: true,
  });

  if (spec.mode === 'entityRows') return entityRows as TResult[];
  if (spec.mode === 'countBySource') {
    return [
      {
        sourceRows,
        countsBySource: countRowsBySource(sourceValues, entityRows, spec.target.root, targetField),
      },
    ] as TResult[];
  }

  const rows = materializeRows<TResult>(targetSpec, targetRows, dataset);
  return spec.mode === 'resolve' ? ([{ sourceRows, rows }] as TResult[]) : rows;
};

const executeRead = <TParams, TResult>(
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
  dataset: InMemoryDataset,
): TResult[] =>
  isRelatedRootReadSpec(queryOrView)
    ? (executeRelatedRootRead(queryOrView, dataset) as TResult[])
    : executePlainRead(queryOrView as PlainGraphRead<TParams, TResult>, params, dataset);

const countRead = <TParams, TResult>(
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
  dataset: InMemoryDataset,
) => {
  if (!isRelatedRootReadSpec(queryOrView)) {
    const spec = resolveQuerySpec(queryOrView as PlainGraphRead<TParams, TResult>, params);
    const count = selectRows(spec, dataset, { applyLimit: false }).length;
    if (spec.cardinality === 'one' && count !== 1) {
      throw new InMemoryDataGraphError(
        `Expected exactly one ${spec.root.name}, received ${count}.`,
        'cardinality_mismatch',
      );
    }
    return count;
  }

  const { sourceField, targetField } = resolveRelatedRootFields(
    queryOrView.target.root,
    queryOrView.sourceEntity,
    queryOrView.relationName,
    queryOrView.relationOwner,
  );
  const sourceValues = uniqueNonNullValues(
    executeEntityRows(queryOrView.source, dataset),
    queryOrView.sourceEntity,
    sourceField,
  );

  if (sourceValues.length === 0) return 0;

  return selectRows(withRelatedTargetPredicate(queryOrView, targetField, sourceValues), dataset, {
    applyLimit: false,
  }).length;
};

export const createInMemoryDataGraphRuntime = (input: {
  dataset: InMemoryDataset;
  entities?: readonly AnyEntityDefinition[];
  relationships?: RelationshipFact[];
}): DataGraphExecutionRuntime<
  InMemoryDataGraphError,
  undefined,
  undefined,
  InMemoryDataGraphError
> &
  EntityMutationCommandExecutionRuntime<InMemoryDataGraphError> &
  ManyToManyRelationshipCommandExecutionRuntime<InMemoryDataGraphError> &
  RelationshipCommandExecutionRuntime<InMemoryDataGraphError> =>
  ({
    get: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.try({
        try: () => executeRead(queryOrView, params, input.dataset)[0] ?? null,
        catch: cause =>
          cause instanceof InMemoryDataGraphError
            ? cause
            : new InMemoryDataGraphError('Failed to execute in-memory read.', 'read_failed', cause),
      }),
    run: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.try({
        try: () => executeRead(queryOrView, params, input.dataset),
        catch: cause =>
          cause instanceof InMemoryDataGraphError
            ? cause
            : new InMemoryDataGraphError('Failed to execute in-memory read.', 'read_failed', cause),
      }),
    stream: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Stream.fromEffect(
        Effect.try({
          try: () => executeRead(queryOrView, params, input.dataset),
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
        try: () => countRead(queryOrView, params, input.dataset),
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
        (input.relationships ??= []),
        command,
      ),
    runRelationshipCommand: command =>
      executeInMemoryRelationshipCommandEffect(input.dataset, input.entities ?? [], command),
  }) satisfies DataGraphExecutionRuntime<
    InMemoryDataGraphError,
    undefined,
    undefined,
    InMemoryDataGraphError
  > &
    EntityMutationCommandExecutionRuntime<InMemoryDataGraphError> &
    ManyToManyRelationshipCommandExecutionRuntime<InMemoryDataGraphError> &
    RelationshipCommandExecutionRuntime<InMemoryDataGraphError>;
