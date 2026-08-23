import type { TaskTrigger } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { createSupabaseTaskStorage } from './index.js';
import type { SupabaseTaskStorageClient } from './index.js';

type FakeRow = Record<string, any>;

const readFakeColumn = (row: FakeRow, column: string) => {
  if (!column.includes('->')) {
    return row[column];
  }

  return column.split('->').reduce<unknown>((current, rawSegment) => {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }

    const segment = rawSegment.replace(/^>*/, '');
    return (current as Record<string, unknown>)[segment];
  }, row);
};

class FakeSupabaseTable {
  private filters = new Map<string, unknown>();
  private orderBy: { column: string; ascending: boolean } | undefined;
  private insertRow: FakeRow | undefined;
  private updateRow: FakeRow | undefined;

  constructor(private readonly rows: FakeRow[]) {}

  insert(row: FakeRow) {
    this.insertRow = row;
    return {
      select: () => ({
        single: async () => {
          if (
            this.rows.some(
              current => current.task_id === row.task_id && current.run_id === row.run_id,
            )
          ) {
            return {
              data: null,
              error: {
                code: '23505',
                message: 'duplicate key value violates unique constraint',
              },
            };
          }

          const next = {
            input: null,
            subject: null,
            runtime: null,
            progress: null,
            result: null,
            error: null,
            started_at: null,
            completed_at: null,
            ...this.insertRow,
          };

          this.rows.push(next);
          return {
            data: next,
            error: null,
          };
        },
      }),
    };
  }

  select() {
    return this;
  }

  update(row: FakeRow) {
    this.updateRow = row;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.orderBy = {
      column,
      ascending: options.ascending,
    };
    return this;
  }

  async maybeSingle() {
    return {
      data: this.findRow() ?? null,
      error: null,
    };
  }

  single() {
    const current = this.findRow();

    if (!current) {
      return Promise.resolve({
        data: null,
        error: null,
      });
    }

    Object.assign(current, this.updateRow);
    return Promise.resolve({
      data: current,
      error: null,
    });
  }

  async limit(value: number) {
    const filtered = this.rows.filter(row =>
      Array.from(this.filters.entries()).every(
        ([column, expected]) => readFakeColumn(row, column) === expected,
      ),
    );
    const ordered = this.orderBy
      ? [...filtered].sort((left, right) => {
          const comparison = String(left[this.orderBy!.column]).localeCompare(
            String(right[this.orderBy!.column]),
          );
          return this.orderBy!.ascending ? comparison : -comparison;
        })
      : filtered;

    return {
      data: ordered.slice(0, value),
      error: null,
    };
  }

  private findRow() {
    return this.rows.find(row =>
      Array.from(this.filters.entries()).every(
        ([column, expected]) => readFakeColumn(row, column) === expected,
      ),
    );
  }
}

const createFakeSupabaseClient = (rows: FakeRow[] = []): SupabaseTaskStorageClient => ({
  from: () => new FakeSupabaseTable(rows) as any,
});

describe('createSupabaseTaskStorage', () => {
  it('creates, reads, updates, and loads task run sources', async () => {
    const store = createSupabaseTaskStorage({
      client: createFakeSupabaseClient(),
      now: () => '2026-06-03T00:00:00.000Z',
    });
    const trigger = {
      cause: 'user_request',
      actor: {
        kind: 'user',
        id: 'user-1',
      },
      ingress: {
        kind: 'server_action',
      },
    } satisfies TaskTrigger;

    const created = await Effect.runPromise(
      store.create({
        taskId: 'demo.say-hello',
        runId: 'run-1',
        input: {
          name: 'Ada',
        },
        trigger,
        subject: {
          type: 'book',
          id: 'book-1',
        },
      }),
    );

    expect(created).toMatchObject({
      taskId: 'demo.say-hello',
      runId: 'run-1',
      status: 'queued',
      input: {
        name: 'Ada',
      },
      trigger,
      subject: {
        type: 'book',
        id: 'book-1',
      },
    });

    const updated = await Effect.runPromise(
      store.update(created, {
        status: 'running',
        progress: {
          phase: 'waiting',
          message: 'Waiting',
        },
      }),
    );

    expect(updated).toMatchObject({
      status: 'running',
      progress: {
        phase: 'waiting',
        message: 'Waiting',
      },
    });

    await Effect.runPromise(
      store.attachRuntimeRef(created, {
        name: 'vercel-workflow',
        runId: 'wrun_1',
      }),
    );

    await expect(Effect.runPromise(store.getSnapshot(created))).resolves.not.toHaveProperty(
      'input',
    );
    await expect(Effect.runPromise(store.loadSource(created))).resolves.toMatchObject({
      taskId: 'demo.say-hello',
      runId: 'run-1',
      input: {
        name: 'Ada',
      },
      runtime: {
        name: 'vercel-workflow',
        runId: 'wrun_1',
      },
    });
  });

  it('lists recent task run summaries without input or result payloads', async () => {
    const rows: FakeRow[] = [
      {
        task_id: 'demo.say-hello',
        run_id: 'older',
        status: 'running',
        input: {
          secret: 'do-not-list',
        },
        trigger: {
          cause: 'system',
        },
        subject: null,
        runtime: null,
        progress: null,
        result: null,
        error: null,
        created_at: '2026-06-03T00:00:00.000Z',
        started_at: null,
        updated_at: '2026-06-03T00:00:02.000Z',
        completed_at: null,
      },
      {
        task_id: 'demo.say-hello',
        run_id: 'newer',
        status: 'completed',
        input: null,
        trigger: {
          cause: 'schedule',
        },
        subject: null,
        runtime: {
          name: 'in-process',
        },
        progress: null,
        result: {
          message: 'Hi there',
        },
        error: null,
        created_at: '2026-06-03T00:00:01.000Z',
        started_at: null,
        updated_at: '2026-06-03T00:00:01.000Z',
        completed_at: '2026-06-03T00:00:01.000Z',
      },
    ];
    const store = createSupabaseTaskStorage({
      client: createFakeSupabaseClient(rows),
    });

    const recent = await Effect.runPromise(store.listRecent(1));

    expect(recent).toEqual([
      expect.objectContaining({
        taskId: 'demo.say-hello',
        runId: 'newer',
        status: 'completed',
        trigger: {
          cause: 'schedule',
        },
        runtime: {
          name: 'in-process',
        },
      }),
    ]);
    expect(recent[0]).not.toHaveProperty('input');
    expect(recent[0]).not.toHaveProperty('result');
  });

  it('lists recent task run summaries scoped to an actor', async () => {
    const rows: FakeRow[] = [
      {
        task_id: 'demo.say-hello',
        run_id: 'mine',
        status: 'completed',
        input: null,
        trigger: {
          cause: 'user_request',
          actor: {
            kind: 'user',
            id: 'user-1',
          },
        },
        subject: null,
        runtime: null,
        progress: null,
        result: null,
        error: null,
        created_at: '2026-06-03T00:00:01.000Z',
        started_at: null,
        updated_at: '2026-06-03T00:00:01.000Z',
        completed_at: '2026-06-03T00:00:01.000Z',
      },
      {
        task_id: 'demo.say-hello',
        run_id: 'theirs',
        status: 'completed',
        input: null,
        trigger: {
          cause: 'user_request',
          actor: {
            kind: 'user',
            id: 'user-2',
          },
        },
        subject: null,
        runtime: null,
        progress: null,
        result: null,
        error: null,
        created_at: '2026-06-03T00:00:02.000Z',
        started_at: null,
        updated_at: '2026-06-03T00:00:02.000Z',
        completed_at: '2026-06-03T00:00:02.000Z',
      },
    ];
    const store = createSupabaseTaskStorage({
      client: createFakeSupabaseClient(rows),
    });

    const recent = await Effect.runPromise(
      store.listRecentForActor(
        {
          kind: 'user',
          id: 'user-1',
        },
        20,
      ),
    );

    expect(recent.map(run => run.runId)).toEqual(['mine']);
  });

  it('returns task failures for duplicate and missing task runs', async () => {
    const store = createSupabaseTaskStorage({
      client: createFakeSupabaseClient(),
    });
    const input = {
      taskId: 'demo.say-hello',
      runId: 'same-run',
    };

    await Effect.runPromise(store.create(input));

    await expect(Effect.runPromise(Effect.flip(store.create(input)))).resolves.toMatchObject({
      reason: 'task_run_already_exists',
    });
    await expect(
      Effect.runPromise(
        Effect.flip(
          store.getSnapshot({
            taskId: 'demo.say-hello',
            runId: 'missing-run',
          }),
        ),
      ),
    ).resolves.toMatchObject({
      reason: 'task_run_not_found',
    });
  });
});
