import { Effect, Stream } from 'effect';

import { resolveQuerySpec, type QueryOrView } from '../query.js';
import type { DataGraphRuntime } from '../runtime.js';

import { materializeRecord, type InMemoryDataset } from './materialization.js';
import { applyOrder, applyPredicates } from './query.js';

const executeInMemory = <TParams, TResult>(
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
  dataset: InMemoryDataset,
) => {
  const spec = resolveQuerySpec(queryOrView, params);
  const rows = applyOrder(
    applyPredicates(dataset[spec.root.name] ?? [], spec.where),
    spec.orderBy,
  ).slice(0, spec.limit ?? Number.POSITIVE_INFINITY);

  return rows.map(row =>
    materializeRecord(row, spec.root, spec.select, spec.includes, dataset),
  ) as TResult[];
};

export const createInMemoryDataGraphRuntime = (input: {
  dataset: InMemoryDataset;
}): DataGraphRuntime =>
  ({
    get: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.sync(() => executeInMemory(queryOrView, params, input.dataset)[0] ?? null),
    run: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Effect.sync(() => executeInMemory(queryOrView, params, input.dataset)),
    stream: <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
      Stream.fromIterable(executeInMemory(queryOrView, params, input.dataset)),
  }) satisfies DataGraphRuntime;
