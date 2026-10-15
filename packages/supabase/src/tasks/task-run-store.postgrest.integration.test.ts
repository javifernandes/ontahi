import { randomUUID } from 'node:crypto';

import { verifyTaskStorageConformance } from '@ontahi/core/runtime/server/tasks';
import { PostgrestClient } from '@supabase/postgrest-js';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Effect } from 'effect';
import { Client } from 'pg';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedNetwork,
  type StartedTestContainer,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { supabaseTaskClaimRpcSql } from './task-claim-rpc-sql.js';
import { createSupabaseTaskStorage, type SupabaseTaskStorageClient } from './task-run-store.js';

describe('Supabase Task Storage through PostgREST', () => {
  let network: StartedNetwork;
  let database: StartedPostgreSqlContainer;
  let rest: StartedTestContainer;
  let administrator: Client;
  let baseUrl: string;

  beforeAll(async () => {
    network = await new Network().start();
    database = await new PostgreSqlContainer('postgres:17-alpine')
      .withPassword(randomUUID())
      .withNetwork(network)
      .withNetworkAliases('database')
      .start();
    administrator = new Client({ connectionString: database.getConnectionUri() });
    await administrator.connect();
    const password = randomUUID();
    await administrator.query(`
      create role task_user nologin;
      create role task_authenticator login noinherit password '${password}';
      grant task_user to task_authenticator;
      create table public.task_runs (
        task_id text not null,
        run_id text not null,
        status text not null,
        input jsonb,
        trigger jsonb not null,
        subject jsonb,
        runtime jsonb,
        progress jsonb,
        checkpoint jsonb,
        result jsonb,
        execution_metadata jsonb,
        error jsonb,
        created_at timestamptz not null,
        started_at timestamptz,
        updated_at timestamptz not null,
        completed_at timestamptz,
        primary key (task_id, run_id)
      );
      alter table public.task_runs enable row level security;
      create policy task_runs_select on public.task_runs for select to task_user using (
        task_id like coalesce(
          current_setting('request.headers', true)::jsonb ->> 'x-task-prefix', ''
        ) || '%'
      );
      create policy task_runs_insert on public.task_runs for insert to task_user with check (
        task_id like coalesce(
          current_setting('request.headers', true)::jsonb ->> 'x-task-prefix', ''
        ) || '%'
      );
      create policy task_runs_update on public.task_runs for update to task_user using (
        task_id like coalesce(
          current_setting('request.headers', true)::jsonb ->> 'x-task-prefix', ''
        ) || '%'
      ) with check (
        task_id like coalesce(
          current_setting('request.headers', true)::jsonb ->> 'x-task-prefix', ''
        ) || '%'
      );
      grant usage on schema public to task_user;
      grant select, insert, update on public.task_runs to task_user;
      ${supabaseTaskClaimRpcSql}
      revoke execute on function public.ontahi_claim_task_run(jsonb) from public;
      grant execute on function public.ontahi_claim_task_run(jsonb) to task_user;
      insert into public.task_runs
        (task_id, run_id, status, trigger, created_at, updated_at)
      values
        ('private.task', 'hidden', 'queued', '{"cause":"system"}', now(), now());
    `);
    rest = await new GenericContainer('postgrest/postgrest:v13.0.0')
      .withNetwork(network)
      .withEnvironment({
        PGRST_DB_URI: `postgres://task_authenticator:${password}@database:5432/${database.getDatabase()}`,
        PGRST_DB_SCHEMAS: 'public',
        PGRST_DB_ANON_ROLE: 'task_user',
      })
      .withExposedPorts(3000)
      .withWaitStrategy(Wait.forHttp('/', 3000))
      .start();
    baseUrl = `http://${rest.getHost()}:${rest.getMappedPort(3000)}`;
  }, 180_000);

  afterAll(async () => {
    await rest?.stop();
    await administrator?.end();
    await database?.stop();
    await network?.stop();
  });

  const storage = () =>
    createSupabaseTaskStorage({
      client: new PostgrestClient(baseUrl, {
        headers: { 'x-task-prefix': 'supabase-' },
      }) as unknown as SupabaseTaskStorageClient,
      now: () => '2026-10-15T00:00:00.000Z',
    });

  it('passes the provider-neutral Task Storage conformance proof', async () => {
    await verifyTaskStorageConformance({
      createStorage: storage,
      identityPrefix: 'supabase-conformance',
    });
  });

  it('lets one independent client cancel a pending Event wait and keeps RLS authoritative', async () => {
    const first = storage();
    const second = storage();
    const ref = { taskId: 'supabase-export', runId: 'cancel-race' };
    await Effect.runPromise(first.create(ref));
    await Effect.runPromise(
      first.update(ref, {
        status: 'waiting',
        checkpoint: {
          version: 1,
          state: { step: 'wait' },
          eventWait: {
            id: 'ready',
            kind: 'event',
            eventId: 'ExportReady',
            eventVersion: 1,
            createdAt: '2026-10-15T00:00:00.000Z',
          },
        },
      }),
    );
    const results = await Promise.all([
      Effect.runPromise(first.cancelEvent(ref, 'ready', 'cancelled')),
      Effect.runPromise(second.cancelEvent(ref, 'ready', 'cancelled')),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(Effect.runPromise(first.listRecent(20))).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ runId: 'hidden' })]),
    );
    await expect(
      Effect.runPromise(
        Effect.flip(first.getSnapshot({ taskId: 'private.task', runId: 'hidden' })),
      ),
    ).resolves.toMatchObject({ reason: 'task_run_not_found' });
  });

  it('rejects unsupported RPC protocol versions and cancellation states', async () => {
    const client = new PostgrestClient(baseUrl, {
      headers: { 'x-task-prefix': 'supabase-' },
    });
    const unsupported = await client.rpc('ontahi_claim_task_run', {
      command: { version: 2, action: 'claim-event' },
    });
    expect(unsupported.error?.message).toContain('Unsupported Ontahi Task claim RPC version');
    const invalidStatus = await client.rpc('ontahi_claim_task_run', {
      command: { version: 1, action: 'cancel-event', status: 'completed' },
    });
    expect(invalidStatus.error?.message).toContain('Unsupported Ontahi Task cancellation status');
  });
});
