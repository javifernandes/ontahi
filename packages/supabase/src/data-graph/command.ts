import {
  compileSelectionExpression,
  getEntityMapping,
  resolveColumnNameForEntity,
  type GraphCommandSpec,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';

import type { SupabaseErrorFactory, SupabaseLikeClient } from './types.js';

import {
  applySupabaseSelection,
  compileSupabaseSelection,
  getProbeColumnForEntity,
  mapEntityPayloadToSupabaseColumns,
  mapSupabaseRowToEntityFields,
} from './index.js';

const DEFAULT_COMMAND_MESSAGES = {
  insert: {
    message: 'Failed to insert record',
    logMessage: 'Data graph command insert failed',
  },
  insert_many: {
    message: 'Failed to insert records',
    logMessage: 'Data graph command bulk insert failed',
  },
  upsert: {
    message: 'Failed to upsert record',
    logMessage: 'Data graph command upsert failed',
  },
  update: {
    message: 'Failed to update record',
    logMessage: 'Data graph command update failed',
  },
  delete: {
    message: 'Failed to delete record',
    logMessage: 'Data graph command delete failed',
  },
} as const;

type ReturningRow<TResult> = TResult extends Array<infer TRow> ? TRow : TResult;

const buildSupabaseCommandQuery = ({
  supabase,
  command,
  mappedPayload,
  selectColumns,
}: {
  supabase: SupabaseLikeClient;
  command: GraphCommandSpec<any, any, any>;
  mappedPayload: unknown;
  selectColumns?: string;
}) => {
  const table = getEntityMapping(command.root).tableName;

  if (command.operation === 'update') {
    const query = supabase.from(table).update(mappedPayload ?? {});
    return selectColumns ? query.select(selectColumns) : query;
  }

  if (command.operation === 'upsert') {
    const query = supabase.from(table).upsert(mappedPayload ?? {}, {
      onConflict: command
        .upsert!.conflictOn.map(fieldName => resolveColumnNameForEntity(command.root, fieldName))
        .join(','),
      ...(command.upsert!.strategy === 'ignore' ? { ignoreDuplicates: true } : {}),
    });
    return selectColumns ? query.select(selectColumns) : query;
  }

  if (command.operation === 'delete') {
    const query = supabase.from(table).delete();
    return selectColumns ? query.select(selectColumns) : query;
  }

  const query = supabase.from(table).insert(mappedPayload ?? {});
  return selectColumns ? query.select(selectColumns) : query;
};

export const executeSupabaseGraphCommandEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TCommandOptions extends object = {},
  TResult = void,
>(
  deps: {
    getClient: (options?: TCommandOptions) => Effect.Effect<TClient, TError>;
    createError: SupabaseErrorFactory<TError>;
    cardinalityMismatchCause?: (actualAffectedRows: number) => unknown;
  },
  command: GraphCommandSpec<any, any, TResult>,
  options?: TCommandOptions & {
    message?: string;
    logMessage?: string;
  },
): Effect.Effect<TResult, TError> =>
  Effect.gen(function* () {
    const supabase = yield* deps.getClient(options);
    const message = options?.message ?? DEFAULT_COMMAND_MESSAGES[command.operation].message;
    const logMessage =
      options?.logMessage ??
      command.name ??
      options?.message ??
      DEFAULT_COMMAND_MESSAGES[command.operation].logMessage;
    const probeColumn = getProbeColumnForEntity(command.root);
    const compiledSelection =
      command.operation === 'update' || command.operation === 'delete'
        ? compileSupabaseSelection(compileSelectionExpression(command.root, command.selection))
        : ({ kind: 'all' } as const);

    const mappedPayload = Array.isArray(command.payload)
      ? command.payload.map(payload =>
          mapEntityPayloadToSupabaseColumns(command.root, payload as Record<string, unknown>),
        )
      : command.payload
        ? mapEntityPayloadToSupabaseColumns(
            command.root,
            command.payload as Record<string, unknown>,
          )
        : undefined;

    const runQuery = <TRow>(
      queryFactory: () => PromiseLike<{ data: TRow[] | null; error: { message: string } | null }>,
    ) =>
      Effect.tryPromise({
        try: async () => {
          const result = await queryFactory();
          if (result.error) {
            throw result.error.message;
          }
          return result.data ?? [];
        },
        catch: cause =>
          deps.createError({
            message,
            logMessage,
            cause,
          }),
      });

    const cardinalityMismatchCause = (actualAffectedRows: number) =>
      deps.cardinalityMismatchCause?.(actualAffectedRows) ??
      `Expected exactly one affected row, got ${actualAffectedRows}`;

    if (compiledSelection.kind === 'none') {
      if (command.cardinality === 'one') {
        return yield* Effect.fail(
          deps.createError({
            message,
            logMessage,
            cause: cardinalityMismatchCause(0),
          }),
        );
      }
      return (command.returning ? [] : undefined) as TResult;
    }

    if (
      command.returning &&
      command.returning.length > 0 &&
      (command.operation === 'insert' ||
        command.operation === 'insert_many' ||
        command.operation === 'upsert' ||
        command.operation === 'update' ||
        command.operation === 'delete')
    ) {
      const returningColumns = command.returning.map(fieldName =>
        resolveColumnNameForEntity(command.root, fieldName),
      );

      const rows = yield* runQuery<Record<string, unknown>>(() => {
        const query = buildSupabaseCommandQuery({
          supabase,
          command,
          mappedPayload,
          selectColumns: returningColumns.join(', '),
        });

        return applySupabaseSelection(query, compiledSelection);
      });

      const mappedRows = rows.map(row =>
        mapSupabaseRowToEntityFields(command.root, row),
      ) as ReturningRow<TResult>[];

      if (command.cardinality === 'one') {
        return mappedRows.length === 1
          ? (mappedRows[0] as TResult)
          : yield* Effect.fail(
              deps.createError({
                message,
                logMessage,
                cause: cardinalityMismatchCause(mappedRows.length),
              }),
            );
      }

      return mappedRows as TResult;
    }

    if (command.cardinality === 'one') {
      const rows = yield* runQuery<Record<string, unknown>>(() => {
        const query = buildSupabaseCommandQuery({
          supabase,
          command,
          mappedPayload,
          selectColumns: probeColumn,
        });

        return applySupabaseSelection(query, compiledSelection);
      });

      if (rows.length !== 1) {
        return yield* Effect.fail(
          deps.createError({
            message,
            logMessage,
            cause: cardinalityMismatchCause(rows.length),
          }),
        );
      }

      return undefined as TResult;
    }

    return yield* Effect.tryPromise({
      try: async () => {
        const query = buildSupabaseCommandQuery({
          supabase,
          command,
          mappedPayload,
        });

        const result = await applySupabaseSelection(query, compiledSelection);
        if (result.error) {
          throw result.error.message;
        }

        return undefined as TResult;
      },
      catch: cause =>
        deps.createError({
          message,
          logMessage,
          cause,
        }),
    });
  });
