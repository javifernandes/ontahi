import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { graphSchema } from '@ontahi/core/data-graph';
import {
  eventDeclaration,
  eventEgressSubscription,
  processNextEventEgressDelivery,
  registerEventEgressSubscription,
  verifyDurableEventRuntimeConformance,
  type EventEmission,
} from '@ontahi/core/runtime/server';
import { createHttpEventEgressTransport } from '@ontahi/runtime-http/event-egress';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPostgresEventRuntime } from './runtime.js';
import { createPostgresEventSchemaSql } from './schema.js';

const emission = (id: string, correlation?: Readonly<Record<string, string>>): EventEmission => ({
  kind: 'event-emission',
  eventId: 'TodoListExportReady',
  eventVersion: 1,
  payload: { requestId: id, url: `https://example.test/${id}` },
  ...(correlation ? { correlation } : {}),
});

const subscription = (id: string, requestId?: string) => ({
  id,
  eventId: 'TodoListExportReady',
  eventVersion: 1,
  ...(requestId ? { correlation: { requestId } } : {}),
});

const TodoListExportReady = eventDeclaration.define({
  id: 'TodoListExportReady',
  version: 1,
  description: 'A requested Todo export is ready.',
  payload: graphSchema.object({
    requestId: graphSchema.string(),
    url: graphSchema.string(),
  }),
});

describe('PostgreSQL Event Runtime', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: Pool;
  let sequence = 0;

  beforeAll(async () => {
    const externalConnectionUri = process.env.ONTAHI_POSTGRES_TEST_URL;
    if (externalConnectionUri) {
      pool = new Pool({ connectionString: externalConnectionUri });
    } else {
      container = await new PostgreSqlContainer('postgres:17-alpine').start();
      pool = new Pool({ connectionString: container.getConnectionUri() });
    }
    for (const statement of createPostgresEventSchemaSql()) await pool.query(statement);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE ontahi_event_deliveries, ontahi_event_subscriptions, ontahi_event_occurrences CASCADE',
    );
    sequence = 0;
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  const runtime = () =>
    createPostgresEventRuntime({
      pool,
      now: () => new Date('2026-10-12T00:00:00.000Z'),
      createId: () => `event-id-${++sequence}`,
    });

  it('advertises only the durable guarantees PostgreSQL currently implements', () => {
    expect(runtime().capabilities).toEqual({
      liveSubscription: true,
      retention: true,
      replay: false,
      durableAcceptance: true,
      durableDelivery: true,
      acknowledgement: true,
      ordering: 'subscription',
      deduplication: false,
      atomicPublication: false,
      overflowBehavior: 'spill',
    });
  });

  it('rejects invalid durable subscription and claim inputs before persistence', async () => {
    const events = runtime();
    await expect(
      events.durableDelivery!.register({ ...subscription('invalid-version'), eventVersion: 0 }),
    ).rejects.toThrow('positive integer');
    await expect(
      events.durableDelivery!.register({
        ...subscription('invalid-correlation'),
        correlation: { value: Number.NaN },
      } as never),
    ).rejects.toThrow('JSON-safe');
    await expect(
      events.durableDelivery!.claim('subscription', { consumerId: 'worker', leaseMs: 0 }),
    ).rejects.toThrow('positive safe integer');
  });

  it('passes the provider-neutral durable Event Runtime conformance proof', async () => {
    await verifyDurableEventRuntimeConformance({
      createRuntime: runtime,
      identityPrefix: 'postgres-conformance',
    });
    const result = await pool.query(
      `SELECT state, failure_reason
       FROM ontahi_event_deliveries
       WHERE subscription_id = $1`,
      ['postgres-conformance.terminal-failure'],
    );
    expect(result.rows).toEqual([{ state: 'failed', failure_reason: 'destination-rejected' }]);
  });

  it('delivers retained occurrences registered before or after acceptance', async () => {
    const events = runtime();
    await events.accept(emission('early', { requestId: 'early' }));
    await events.durableDelivery!.register(subscription('early-wait', 'early'));

    await events.durableDelivery!.register(subscription('late-wait', 'late'));
    await events.accept(emission('late', { requestId: 'late' }));

    const early = await events.durableDelivery!.claim('early-wait', {
      consumerId: 'worker-1',
      leaseMs: 1_000,
    });
    const late = await events.durableDelivery!.claim('late-wait', {
      consumerId: 'worker-1',
      leaseMs: 1_000,
    });
    expect(early?.delivery.occurrence.payload).toEqual({
      requestId: 'early',
      url: 'https://example.test/early',
    });
    expect(late?.delivery.occurrence.payload).toEqual({
      requestId: 'late',
      url: 'https://example.test/late',
    });
    expect(early?.delivery.attempt).toBe(1);
    expect(early?.delivery.occurrence.occurredAt).toBe('2026-10-12T00:00:00.000Z');
  });

  it('claims backfilled deliveries in occurrence order when timestamps tie', async () => {
    const ids = ['z-first-occurrence', 'a-second-occurrence'];
    const events = createPostgresEventRuntime({
      pool,
      now: () => new Date('2026-10-12T00:00:00.000Z'),
      createId: () => ids.shift() ?? `claim-${++sequence}`,
    });
    await events.accept(emission('first'));
    await events.accept(emission('second'));
    await events.durableDelivery!.register(subscription('ordered-backfill'));

    const first = await events.durableDelivery!.claim('ordered-backfill', {
      consumerId: 'worker-1',
      leaseMs: 1_000,
    });
    expect(first?.delivery.occurrence.payload).toMatchObject({ requestId: 'first' });
    await events.durableDelivery!.acknowledge(first!);
    const second = await events.durableDelivery!.claim('ordered-backfill', {
      consumerId: 'worker-1',
      leaseMs: 1_000,
    });
    expect(second?.delivery.occurrence.payload).toMatchObject({ requestId: 'second' });
  });

  it('matches correlation without consuming unrelated retained occurrences', async () => {
    const events = runtime();
    await events.accept(emission('other', { requestId: 'other' }));
    await events.accept(emission('wanted', { requestId: 'wanted', tenant: 'acme' }));
    await events.durableDelivery!.register(subscription('wanted-wait', 'wanted'));

    const claim = await events.durableDelivery!.claim('wanted-wait', {
      consumerId: 'worker-1',
      leaseMs: 1_000,
    });
    expect(claim?.delivery.occurrence.correlation).toEqual({ requestId: 'wanted', tenant: 'acme' });
    await events.durableDelivery!.acknowledge(claim!);
    await expect(
      events.durableDelivery!.claim('wanted-wait', { consumerId: 'worker-1', leaseMs: 1_000 }),
    ).resolves.toBeUndefined();
  });

  it('does not lose delivery when registration races occurrence acceptance', async () => {
    const events = runtime();
    await Promise.all([
      events.durableDelivery!.register(subscription('racing-wait', 'racing')),
      events.accept(emission('racing', { requestId: 'racing' })),
    ]);

    await expect(
      events.durableDelivery!.claim('racing-wait', {
        consumerId: 'worker-1',
        leaseMs: 1_000,
      }),
    ).resolves.toMatchObject({
      delivery: { occurrence: { correlation: { requestId: 'racing' } } },
    });
  });

  it('claims atomically, retries released and expired claims, and never redelivers acknowledgement', async () => {
    const events = runtime();
    await events.durableDelivery!.register(subscription('export-wait'));
    await events.accept(emission('request-1'));

    const claims = await Promise.all([
      events.durableDelivery!.claim('export-wait', { consumerId: 'worker-1', leaseMs: 1_000 }),
      events.durableDelivery!.claim('export-wait', { consumerId: 'worker-2', leaseMs: 1_000 }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims.find(Boolean)!;
    await events.durableDelivery!.release(first);

    const retried = await events.durableDelivery!.claim('export-wait', {
      consumerId: 'worker-2',
      leaseMs: 1,
    });
    expect(retried?.delivery.deliveryId).toBe(first.delivery.deliveryId);
    expect(retried?.delivery.attempt).toBe(2);
    await new Promise(resolve => setTimeout(resolve, 5));

    const afterExpiry = await events.durableDelivery!.claim('export-wait', {
      consumerId: 'worker-3',
      leaseMs: 1_000,
    });
    expect(afterExpiry?.delivery.attempt).toBe(3);
    await expect(events.durableDelivery!.acknowledge(retried!)).rejects.toThrow('stale');
    await events.durableDelivery!.acknowledge(afterExpiry!);
    await expect(
      events.durableDelivery!.claim('export-wait', { consumerId: 'worker-4', leaseMs: 1_000 }),
    ).resolves.toBeUndefined();
  });

  it('survives runtime recreation and keeps durable subscription identity stable', async () => {
    const firstRuntime = runtime();
    await firstRuntime.durableDelivery!.register(subscription('stable-wait', 'request-1'));
    await firstRuntime.accept(emission('request-1', { requestId: 'request-1' }));

    const recreated = runtime();
    const claim = await recreated.durableDelivery!.claim('stable-wait', {
      consumerId: 'restarted-worker',
      leaseMs: 1_000,
    });
    expect(claim?.delivery.subscriptionId).toBe('stable-wait');
    expect(claim?.delivery.occurrence.occurrenceId).toBe('event-id-1');
    await expect(
      recreated.durableDelivery!.register(subscription('stable-wait', 'different')),
    ).rejects.toThrow('already registered differently');
  });

  it('recovers a retained delivery and acknowledges signed HTTP egress exactly once', async () => {
    const egress = eventEgressSubscription({
      id: 'todo-export-webhook',
      event: TodoListExportReady,
      destinationId: 'local-receiver',
      project: occurrence => ({
        occurrenceId: occurrence.occurrenceId,
        data: occurrence.payload,
      }),
    });
    const firstRuntime = runtime();
    await registerEventEgressSubscription(firstRuntime, egress);
    await firstRuntime.accept(emission('request-1'));

    const received: { body: string; attempt: string | undefined; signature: string | undefined }[] =
      [];
    const receiver = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        const attemptHeader = request.headers['x-ontahi-attempt'];
        const signatureHeader = request.headers['x-ontahi-signature'];
        received.push({
          body: Buffer.concat(chunks).toString('utf8'),
          attempt: Array.isArray(attemptHeader) ? attemptHeader[0] : attemptHeader,
          signature: Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader,
        });
        response.writeHead(received.length === 1 ? 503 : 204, { 'retry-after': '0.01' }).end();
      });
    });
    await new Promise<void>(resolve => receiver.listen(0, '127.0.0.1', resolve));

    try {
      const url = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
      const secret = 'sql-egress-secret';
      const options = {
        runtime: runtime(),
        subscription: egress,
        leaseMs: 5_000,
        resolveDestination: async () => ({
          url,
          signing: { kind: 'hmac-sha256' as const, secret },
        }),
        transport: createHttpEventEgressTransport(),
      };

      const first = await processNextEventEgressDelivery({
        ...options,
        consumerId: 'worker-before-restart',
      });
      await new Promise(resolve => setTimeout(resolve, 30));
      const second = await processNextEventEgressDelivery({
        ...options,
        runtime: runtime(),
        consumerId: 'worker-after-restart',
      });
      const idle = await processNextEventEgressDelivery({
        ...options,
        runtime: runtime(),
        consumerId: 'worker-after-acknowledgement',
      });

      expect(first).toMatchObject({ kind: 'retryable', attempt: 1 });
      expect(first).toHaveProperty('retryAfterMs', 10);
      if (first.kind !== 'retryable')
        throw new Error('Expected the first attempt to be retryable.');
      expect(second).toMatchObject({
        kind: 'accepted',
        attempt: 2,
        deliveryId: first.deliveryId,
      });
      expect(idle).toEqual({ kind: 'idle', subscriptionId: egress.id });
      expect(received).toHaveLength(2);
      expect(received.map(request => request.attempt)).toEqual(['1', '2']);
      expect(received[0]?.body).toBe(received[1]?.body);
      expect(received[1]?.signature).toBe(
        `sha256=${createHmac('sha256', secret).update(received[1]!.body).digest('hex')}`,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        receiver.close(error => (error ? reject(error) : resolve())),
      );
    }
  });

  it('cancels future matching deliveries without erasing retained occurrences', async () => {
    const events = runtime();
    await events.durableDelivery!.register(subscription('cancelled-wait'));
    await events.accept(emission('before-cancel'));
    await events.durableDelivery!.cancel('cancelled-wait');
    await events.accept(emission('after-cancel'));

    const retained = await events.durableDelivery!.claim('cancelled-wait', {
      consumerId: 'worker-1',
      leaseMs: 1_000,
    });
    expect(retained?.delivery.occurrence.payload).toMatchObject({ requestId: 'before-cancel' });
    await events.durableDelivery!.acknowledge(retained!);
    await expect(
      events.durableDelivery!.claim('cancelled-wait', {
        consumerId: 'worker-1',
        leaseMs: 1_000,
      }),
    ).resolves.toBeUndefined();
    const occurrences = await pool.query('SELECT occurrence_id FROM ontahi_event_occurrences');
    expect(occurrences.rowCount).toBe(2);
  });

  it('keeps live subscribers isolated from durable acceptance', async () => {
    const subscriberFailure = vi.fn();
    const events = createPostgresEventRuntime({
      pool,
      createId: () => `event-id-${++sequence}`,
      onSubscriberError: subscriberFailure,
    });
    const successful = vi.fn();
    events.subscribe('TodoListExportReady', () => {
      throw new Error('subscriber failed');
    });
    const cancellable = events.subscribe('TodoListExportReady', successful);

    await expect(events.accept(emission('request-1'))).resolves.toMatchObject({
      eventId: 'TodoListExportReady',
    });
    expect(subscriberFailure).toHaveBeenCalledOnce();
    expect(successful).toHaveBeenCalledOnce();
    cancellable.cancel();
    await events.accept(emission('request-2'));
    expect(successful).toHaveBeenCalledOnce();
  });
});
