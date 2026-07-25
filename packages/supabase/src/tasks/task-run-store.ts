import {
  duplicateTaskRunFailure,
  missingTaskRunFailure,
  normalizeTaskTrigger,
  type TaskActor,
  type TaskFailure,
  type TaskRunCreateInput,
  type TaskRunIdentity,
  type TaskRunListItem,
  type TaskRunSource,
  type TaskSnapshot,
  type TaskStatus,
  type TaskStorage,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';

type SupabaseErrorLike = {
  code?: string;
  message: string;
};

type SupabaseQueryResult<TData> = {
  data: TData | null;
  error: SupabaseErrorLike | null;
};

type SupabaseQuery<TData> = PromiseLike<SupabaseQueryResult<TData>>;

export type SupabaseTaskStorageClient = {
  from(tableName: string): {
    insert(row: Record<string, unknown>): {
      select(columns?: string): {
        single(): SupabaseQuery<TaskRunRow>;
      };
    };
    select(columns?: string): SupabaseTaskRunSelectQuery;
    update(row: Record<string, unknown>): SupabaseTaskRunMutationQuery;
  };
};

type SupabaseTaskRunSelectQuery = {
  eq(column: string, value: unknown): SupabaseTaskRunSelectQuery;
  maybeSingle(): SupabaseQuery<TaskRunRow>;
  order(column: string, options: { ascending: boolean }): SupabaseTaskRunSelectQuery;
  limit(value: number): SupabaseQuery<TaskRunRow[]>;
};

type SupabaseTaskRunMutationQuery = {
  eq(column: string, value: unknown): SupabaseTaskRunMutationQuery;
  select(columns?: string): {
    single(): SupabaseQuery<TaskRunRow>;
  };
};

type TaskRunRow = {
  task_id: string;
  run_id: string;
  status: TaskStatus;
  input: unknown | null;
  trigger: TaskRunSource['trigger'];
  subject: TaskRunSource['subject'] | null;
  runtime: TaskRunSource['runtime'] | null;
  progress: TaskRunSource['progress'] | null;
  result: unknown | null;
  error: TaskRunSource['error'] | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
};

export type CreateSupabaseTaskStorageOptions = {
  client: SupabaseTaskStorageClient;
  tableName?: string;
  now?: () => string;
};

const DEFAULT_TABLE_NAME = 'task_runs';

const defaultNow = () => new Date().toISOString();

const toTaskFailure = (
  reason: string,
  message: string,
  extra?: Record<string, unknown>,
): TaskFailure => ({
  reason,
  message,
  ...(extra ?? {}),
});

const toPersistenceFailure = (message: string, error: SupabaseErrorLike | null): TaskFailure =>
  toTaskFailure('task_run_store_failed', message, {
    ...(error?.code ? { code: error.code } : {}),
    ...(error?.message ? { cause: error.message } : {}),
  });

const toCaughtFailure = (error: unknown): TaskFailure =>
  typeof error === 'object' &&
  error !== null &&
  'reason' in error &&
  'message' in error &&
  typeof (error as { reason: unknown }).reason === 'string' &&
  typeof (error as { message: unknown }).message === 'string'
    ? (error as TaskFailure)
    : toTaskFailure('task_run_store_failed', 'Task run store operation failed.', {
        cause: error instanceof Error ? error.message : String(error),
      });

const toSnapshot = (source: TaskRunSource): TaskSnapshot => ({
  taskId: source.taskId,
  runId: source.runId,
  status: source.status,
  subject: source.subject,
  createdAt: source.createdAt,
  startedAt: source.startedAt,
  updatedAt: source.updatedAt,
  completedAt: source.completedAt,
  progress: source.progress,
  error: source.error,
});

const toListItem = (source: TaskRunSource): TaskRunListItem => ({
  ...toSnapshot(source),
  trigger: source.trigger,
  runtime: source.runtime,
});

const fromRow = (row: TaskRunRow): TaskRunSource => ({
  taskId: row.task_id,
  runId: row.run_id,
  status: row.status,
  input: row.input ?? undefined,
  trigger: normalizeTaskTrigger(row.trigger ?? undefined),
  subject: row.subject ?? undefined,
  runtime: row.runtime ?? undefined,
  progress: row.progress ?? undefined,
  result: row.result ?? undefined,
  error: row.error ?? undefined,
  createdAt: row.created_at,
  startedAt: row.started_at ?? undefined,
  updatedAt: row.updated_at,
  completedAt: row.completed_at ?? undefined,
});

const toCreateRow = (input: TaskRunCreateInput, now: string): Record<string, unknown> => ({
  task_id: input.taskId,
  run_id: input.runId,
  status: 'queued',
  input: input.input ?? null,
  trigger: normalizeTaskTrigger(input.trigger),
  subject: input.subject ?? null,
  runtime: input.runtime ?? null,
  created_at: now,
  updated_at: now,
});

const toPatchRow = (
  current: TaskRunSource,
  patch: Partial<TaskRunSource>,
  now: string,
): Record<string, unknown> => ({
  status: patch.status ?? current.status,
  input: patch.input === undefined ? (current.input ?? null) : patch.input,
  trigger: patch.trigger ?? current.trigger,
  subject: patch.subject === undefined ? (current.subject ?? null) : patch.subject,
  runtime: patch.runtime === undefined ? (current.runtime ?? null) : patch.runtime,
  progress: patch.progress
    ? { ...current.progress, ...patch.progress }
    : (current.progress ?? null),
  result: patch.result === undefined ? (current.result ?? null) : patch.result,
  error: patch.error === undefined ? (current.error ?? null) : patch.error,
  started_at: patch.startedAt === undefined ? (current.startedAt ?? null) : patch.startedAt,
  updated_at: patch.updatedAt ?? now,
  completed_at: patch.completedAt === undefined ? (current.completedAt ?? null) : patch.completedAt,
});

const keyFilters = <TQuery extends { eq(column: string, value: unknown): TQuery }>(
  query: TQuery,
  ref: TaskRunIdentity,
) => query.eq('task_id', ref.taskId).eq('run_id', ref.runId);

const actorFilters = <TQuery extends { eq(column: string, value: unknown): TQuery }>(
  query: TQuery,
  actor: TaskActor,
) => {
  const byKind = query.eq('trigger->actor->>kind', actor.kind);
  return actor.id === undefined ? byKind : byKind.eq('trigger->actor->>id', actor.id);
};

export const createSupabaseTaskStorage = ({
  client,
  tableName = DEFAULT_TABLE_NAME,
  now = defaultNow,
}: CreateSupabaseTaskStorageOptions): TaskStorage => {
  const loadRow = async (ref: TaskRunIdentity) => {
    const result = await keyFilters(client.from(tableName).select('*'), ref).maybeSingle();

    if (result.error) {
      throw toPersistenceFailure('Failed to load task run.', result.error);
    }

    if (!result.data) {
      throw missingTaskRunFailure(ref);
    }

    return result.data;
  };

  const updateFromPatch = async (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) => {
    const current = fromRow(await loadRow(ref));
    const result = await keyFilters(
      client.from(tableName).update(toPatchRow(current, patch, now())),
      ref,
    )
      .select('*')
      .single();

    if (result.error) {
      throw toPersistenceFailure('Failed to update task run.', result.error);
    }

    if (!result.data) {
      throw missingTaskRunFailure(ref);
    }

    return fromRow(result.data);
  };

  return {
    create: input =>
      Effect.tryPromise({
        try: async () => {
          const result = await client
            .from(tableName)
            .insert(toCreateRow(input, now()))
            .select('*')
            .single();

          if (result.error) {
            if (result.error.code === '23505') {
              throw duplicateTaskRunFailure(input);
            }

            throw toPersistenceFailure('Failed to create task run.', result.error);
          }

          if (!result.data) {
            throw toPersistenceFailure('Failed to create task run.', {
              message: 'Supabase did not return the inserted task run.',
            });
          }

          return fromRow(result.data);
        },
        catch: toCaughtFailure,
      }),
    update: (ref, patch) =>
      Effect.tryPromise({
        try: async () => toSnapshot(await updateFromPatch(ref, patch)),
        catch: toCaughtFailure,
      }),
    attachRuntimeRef: (ref, runtime) =>
      Effect.tryPromise({
        try: async () => toSnapshot(await updateFromPatch(ref, { runtime })),
        catch: toCaughtFailure,
      }),
    get: ref =>
      Effect.tryPromise({
        try: async () => toSnapshot(fromRow(await loadRow(ref))),
        catch: toCaughtFailure,
      }),
    getSnapshot: ref =>
      Effect.tryPromise({
        try: async () => toSnapshot(fromRow(await loadRow(ref))),
        catch: toCaughtFailure,
      }),
    loadSource: ref =>
      Effect.tryPromise({
        try: async () => fromRow(await loadRow(ref)),
        catch: toCaughtFailure,
      }),
    listRecent: (limit = 20) =>
      Effect.tryPromise({
        try: async () => {
          const result = await client
            .from(tableName)
            .select('*')
            .order('created_at', {
              ascending: false,
            })
            .limit(limit);

          if (result.error) {
            throw toPersistenceFailure('Failed to list task runs.', result.error);
          }

          return (result.data ?? []).map(row => toListItem(fromRow(row)));
        },
        catch: toCaughtFailure,
      }),
    listRecentForActor: (actor, limit = 20) =>
      Effect.tryPromise({
        try: async () => {
          const result = await actorFilters(client.from(tableName).select('*'), actor)
            .order('created_at', {
              ascending: false,
            })
            .limit(limit);

          if (result.error) {
            throw toPersistenceFailure('Failed to list task runs for actor.', result.error);
          }

          return (result.data ?? []).map(row => toListItem(fromRow(row)));
        },
        catch: toCaughtFailure,
      }),
  };
};
