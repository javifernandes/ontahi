import { Effect } from 'effect';

import { hasOwn } from '../../value/object.js';
import type { GraphCommandSpec } from '../command.js';
import {
  liftEntityReferenceRecord,
  lowerEntityReferenceRecord,
  lowerEntityReferenceSelection,
} from '../reference-field.js';

import type { InMemoryDataset } from './materialization.js';
import { applySelectionExpression } from './query.js';

export type InMemoryDataGraphFailureReason =
  | 'cardinality_mismatch'
  | 'invalid_command'
  | 'read_failed'
  | 'mutation_failed';

export class InMemoryDataGraphError extends Error {
  readonly _tag = 'InMemoryDataGraphError';

  constructor(
    message: string,
    readonly reason: InMemoryDataGraphFailureReason,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'InMemoryDataGraphError';
  }
}

const payloadRows = (command: GraphCommandSpec<any, any, any>) => {
  if (command.operation === 'insert_many' || command.operation === 'upsert') {
    if (command.operation === 'upsert' && !Array.isArray(command.payload)) {
      return command.payload
        ? [lowerEntityReferenceRecord(command.root, command.payload as Record<string, unknown>)]
        : [];
    }

    if (!Array.isArray(command.payload)) {
      throw new InMemoryDataGraphError(
        'Bulk commands require an array payload.',
        'invalid_command',
      );
    }

    return command.payload.map(row =>
      lowerEntityReferenceRecord(command.root, row as Record<string, unknown>),
    );
  }

  if (!command.payload || Array.isArray(command.payload)) {
    throw new InMemoryDataGraphError(
      `${command.operation} commands require an object payload.`,
      'invalid_command',
    );
  }

  return [lowerEntityReferenceRecord(command.root, command.payload as Record<string, unknown>)];
};

const projectReturningRows = (
  entity: GraphCommandSpec['root'],
  rows: ReadonlyArray<Record<string, unknown>>,
  fields: readonly string[],
) =>
  rows.map(row =>
    liftEntityReferenceRecord(entity, Object.fromEntries(fields.map(field => [field, row[field]]))),
  );

const assertOneAffectedRow = (
  command: GraphCommandSpec<any, any, any>,
  rows: ReadonlyArray<Record<string, unknown>>,
) => {
  if (command.cardinality === 'one' && rows.length !== 1) {
    throw new InMemoryDataGraphError(
      `Expected exactly one affected row, got ${rows.length}.`,
      'cardinality_mismatch',
    );
  }
};

const executeMutation = (dataset: InMemoryDataset, command: GraphCommandSpec<any, any, any>) => {
  const entityName = command.root.name;
  const currentRows = [...(dataset[entityName] ?? [])];
  let nextRows = currentRows;
  let affectedRows: Array<Record<string, unknown>> = [];

  if (command.operation === 'insert' || command.operation === 'insert_many') {
    affectedRows = payloadRows(command);
    nextRows = [...currentRows, ...affectedRows];
  } else if (command.operation === 'upsert') {
    const payloads = payloadRows(command);
    const conflictFields = command.upsert?.conflictOn ?? [];

    if (
      payloads.length === 0 ||
      conflictFields.length === 0 ||
      (command.upsert?.strategy !== 'ignore' && command.upsert?.strategy !== 'merge') ||
      payloads.some(payload => conflictFields.some(field => !hasOwn(payload, field)))
    ) {
      throw new InMemoryDataGraphError(
        'Upsert commands require a strategy and payload values for every conflict field.',
        'invalid_command',
      );
    }

    for (const payload of payloads) {
      const existingIndex = nextRows.findIndex(row =>
        conflictFields.every(field => row[field] === payload[field]),
      );

      if (existingIndex < 0) {
        affectedRows.push(payload);
        nextRows = [...nextRows, payload];
      } else if (command.upsert?.strategy === 'merge') {
        const merged = { ...nextRows[existingIndex], ...payload };
        affectedRows.push(merged);
        nextRows = nextRows.map((row, index) => (index === existingIndex ? merged : row));
      }
    }
  } else if (command.operation === 'update') {
    const [payload] = payloadRows(command);
    const matches = new Set(
      applySelectionExpression(
        currentRows,
        lowerEntityReferenceSelection(command.root, command.selection),
      ),
    );

    nextRows = currentRows.map(row => {
      if (!matches.has(row)) {
        return row;
      }

      const updated = { ...row, ...payload };
      affectedRows.push(updated);
      return updated;
    });
  } else {
    const matches = new Set(
      applySelectionExpression(
        currentRows,
        lowerEntityReferenceSelection(command.root, command.selection),
      ),
    );
    affectedRows = currentRows.filter(row => matches.has(row));
    nextRows = currentRows.filter(row => !matches.has(row));
  }

  assertOneAffectedRow(command, affectedRows);
  dataset[entityName] = nextRows;

  if (!command.returning || command.returning.length === 0) {
    return undefined;
  }

  const returnedRows = projectReturningRows(command.root, affectedRows, command.returning);
  return command.cardinality === 'one' ? returnedRows[0] : returnedRows;
};

export const executeInMemoryGraphCommandEffect = <TResult>(
  dataset: InMemoryDataset,
  command: GraphCommandSpec<any, any, TResult>,
): Effect.Effect<TResult, InMemoryDataGraphError> =>
  Effect.try({
    try: () => executeMutation(dataset, command) as TResult,
    catch: cause =>
      cause instanceof InMemoryDataGraphError
        ? cause
        : new InMemoryDataGraphError(
            `Failed to execute in-memory ${command.operation} command.`,
            'mutation_failed',
            cause,
          ),
  });
