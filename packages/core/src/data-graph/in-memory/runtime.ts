import { Effect, Stream } from 'effect';

import type { GraphCommandSpec } from '../command.js';
import {
  resolveQuerySpec,
  type PlainGraphRead,
  type QueryOrView,
  type QuerySpec,
} from '../query.js';
import {
  isRelatedRootReadSpec,
  resolveRelatedRootFields,
  type RelatedRootReadMode,
  type RelatedRootReadSpec,
} from '../relation-root.js';
import type { DataGraphExecutionRuntime } from '../runtime.js';

import { executeInMemoryGraphCommandEffect, type InMemoryDataGraphError } from './command.js';
import { materializeRecord, type InMemoryDataset } from './materialization.js';
import { applyOrder, applyPredicates } from './query.js';

const selectRows = (
  spec: QuerySpec<any, any>,
  dataset: InMemoryDataset,
  options?: { applyLimit?: boolean },
) => {
  const rows = applyOrder(applyPredicates(dataset[spec.root.name] ?? [], spec.where), spec.orderBy);

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

  return materializeRows(spec, selectRows(spec, dataset), dataset, options);
};

const uniqueNonNullValues = (rows: Array<Record<string, unknown>>, field: string) => [
  ...new Set(rows.map(row => row[field]).filter(value => value != null)),
];

const withRelatedTargetPredicate = (
  spec: RelatedRootReadSpec,
  targetField: string,
  sourceValues: readonly unknown[],
): QuerySpec<any, any> => ({
  ...spec.target,
  where: [
    ...spec.target.where,
    {
      kind: 'predicate',
      operator: 'in',
      fieldName: targetField,
      values: sourceValues,
    },
  ],
});

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
  targetField: string,
) => {
  const counts = new Map<unknown, number>(sourceValues.map(value => [value, 0]));

  for (const row of rows) {
    const value = row[targetField];
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
  );
  const sourceEntityRows = executeEntityRows(spec.source, dataset);
  const sourceRows =
    spec.mode === 'resolve' || spec.mode === 'countBySource'
      ? executeRead(spec.source, undefined, dataset)
      : sourceEntityRows;
  const sourceValues = uniqueNonNullValues(sourceEntityRows, sourceField);

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
        countsBySource: countRowsBySource(sourceValues, entityRows, targetField),
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
    return selectRows(spec, dataset, { applyLimit: false }).length;
  }

  const { sourceField, targetField } = resolveRelatedRootFields(
    queryOrView.target.root,
    queryOrView.sourceEntity,
    queryOrView.relationName,
  );
  const sourceValues = uniqueNonNullValues(
    executeEntityRows(queryOrView.source, dataset),
    sourceField,
  );

  if (sourceValues.length === 0) return 0;

  return selectRows(withRelatedTargetPredicate(queryOrView, targetField, sourceValues), dataset, {
    applyLimit: false,
  }).length;
};

export const createInMemoryDataGraphRuntime = (input: {
  dataset: InMemoryDataset;
}): DataGraphExecutionRuntime<never, undefined, undefined, InMemoryDataGraphError> =>
  ({
    get: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.sync<TResult | null>(() => executeRead(queryOrView, params, input.dataset)[0] ?? null),
    run: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.sync<TResult[]>(() => executeRead(queryOrView, params, input.dataset)),
    stream: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Stream.fromIterable(executeRead(queryOrView, params, input.dataset)),
    count: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.sync(() => countRead(queryOrView, params, input.dataset)),
    runCommand: <TResult>(command: GraphCommandSpec<any, any, TResult>) =>
      executeInMemoryGraphCommandEffect(input.dataset, command),
  }) satisfies DataGraphExecutionRuntime<never, undefined, undefined, InMemoryDataGraphError>;
