import {
  verifyDurableEventRuntimeConformance,
  type EventEmission,
} from '@ontahi/core/runtime/server';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startMysqlTestDatabase } from '../data-graph/mysql.test-support.js';

import { createMysqlEventRuntime } from './runtime.js';
import { createMysqlEventSchemaSql } from './schema.js';

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

describe('MySQL Event Runtime', () => {
  let pool: Pool;
  let close: () => Promise<void>;
  let sequence = 0;

  beforeAll(async () => {
    const database = await startMysqlTestDatabase();
    pool = database.pool;
    close = database.close;
    for (const statement of createMysqlEventSchemaSql()) await pool.query(statement);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM ontahi_event_deliveries');
    await pool.query('DELETE FROM ontahi_event_subscriptions');
    await pool.query('DELETE FROM ontahi_event_occurrences');
    sequence = 0;
  });

  afterAll(async () => close?.());

  const runtime = () =>
    createMysqlEventRuntime({
      pool,
      now: () => new Date('2026-10-13T00:00:00.000Z'),
      createId: () => `event-id-${++sequence}`,
    });

  it('advertises only the durable guarantees MySQL currently implements', () => {
    expect(runtime().capabilities).toEqual({
      liveSubscription: true,
      retention: true,
      replay: false,
      durableAcceptance: true,
      durableDelivery: true,
      deliveryInspection: true,
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
      identityPrefix: 'mysql-conformance',
    });
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT state, failure_reason
       FROM ontahi_event_deliveries
       WHERE subscription_id = ?`,
      ['mysql-conformance.terminal-failure'],
    );
    expect(rows).toEqual([{ state: 'failed', failure_reason: 'destination-rejected' }]);
  });

  it('inspects a bounded payload-free snapshot of durable delivery state', async () => {
    const events = runtime();
    await events.durableDelivery!.register(subscription('inspect-deliveries'));
    const failedOccurrenceIds: string[] = [];
    for (const key of ['inspect-failed-first', 'inspect-failed-second']) {
      const occurrence = await events.accept(emission(key));
      const claim = await events.durableDelivery!.claim('inspect-deliveries', {
        consumerId: 'private-worker-id',
        leaseMs: 1_000,
      });
      await events.durableDelivery!.fail(claim!, { reason: 'destination-rejected' });
      failedOccurrenceIds.push(occurrence.occurrenceId);
    }
    await events.accept(emission('inspect-pending'));

    const inspected = await events.deliveryInspection!.inspect('inspect-deliveries', {
      limit: 10,
      states: ['failed'],
    });

    expect(inspected.map(row => row.occurrenceId).sort()).toEqual(failedOccurrenceIds.sort());
    for (const row of inspected) {
      expect(row).toMatchObject({
        kind: 'durable-event-delivery-inspection',
        subscriptionId: 'inspect-deliveries',
        eventId: 'TodoListExportReady',
        eventVersion: 1,
        state: 'failed',
        attempt: 1,
        failureReason: 'destination-rejected',
      });
      expect(row).not.toHaveProperty('payload');
      expect(row).not.toHaveProperty('claimedBy');
      expect(row.failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    const bounded = await events.deliveryInspection!.inspect('inspect-deliveries', {
      limit: 1,
      states: ['failed'],
    });
    expect(bounded).toHaveLength(1);
    expect(failedOccurrenceIds).toContain(bounded[0]?.occurrenceId);
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
    expect(early?.delivery.occurrence.occurredAt).toBe('2026-10-13T00:00:00.000Z');
  });

  it('claims backfilled deliveries in acceptance order when timestamps tie', async () => {
    const ids = ['z-first-occurrence', 'a-second-occurrence'];
    const events = createMysqlEventRuntime({
      pool,
      now: () => new Date('2026-10-13T00:00:00.000Z'),
      createId: () => ids.shift() ?? `claim-${++sequence}`,
    });
    await events.accept(emission('first'));
    await events.accept(emission('second'));
    await events.durableDelivery!.register(subscription('ordered-backfill'));

    const first = await events.durableDelivery!.claim('ordered-backfill', {
      consumerId: 'worker-1',
      leaseMs: 1_000,
    });
    expect(first?.delivery.occurrence.payload).toEqual({
      requestId: 'first',
      url: 'https://example.test/first',
    });
    await events.durableDelivery!.acknowledge(first!);
    const second = await events.durableDelivery!.claim('ordered-backfill', {
      consumerId: 'worker-1',
      leaseMs: 1_000,
    });
    expect(second?.delivery.occurrence.payload).toEqual({
      requestId: 'second',
      url: 'https://example.test/second',
    });
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

  it('matches durable Event identities exactly under a case-insensitive database default', async () => {
    const events = runtime();
    await events.durableDelivery!.register({
      id: 'case-sensitive-wait',
      eventId: 'TodoListExportReady',
      eventVersion: 1,
    });
    await events.accept({ ...emission('wrong-case'), eventId: 'todolistexportready' });

    await expect(
      events.durableDelivery!.claim('case-sensitive-wait', {
        consumerId: 'worker-1',
        leaseMs: 1_000,
      }),
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

  it('claims atomically, retries released and expired claims, and fences stale claims', async () => {
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
    await new Promise(resolve => setTimeout(resolve, 10));

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

  it('cancels future deliveries without erasing retained occurrences', async () => {
    const events = runtime();
    await events.durableDelivery!.register(subscription('cancelled-wait'));
    await events.accept(emission('before-cancel'));
    await events.durableDelivery!.cancel('cancelled-wait');
    await events.accept(emission('after-cancel'));

    const retained = await events.durableDelivery!.claim('cancelled-wait', {
      consumerId: 'worker-1',
      leaseMs: 1_000,
    });
    expect(retained?.delivery.occurrence.payload).toEqual({
      requestId: 'before-cancel',
      url: 'https://example.test/before-cancel',
    });
    await events.durableDelivery!.acknowledge(retained!);
    await expect(
      events.durableDelivery!.claim('cancelled-wait', {
        consumerId: 'worker-1',
        leaseMs: 1_000,
      }),
    ).resolves.toBeUndefined();
    const [occurrences] = await pool.query<RowDataPacket[]>(
      'SELECT occurrence_id FROM ontahi_event_occurrences',
    );
    expect(occurrences).toHaveLength(2);
  });

  it('keeps live subscribers isolated from durable acceptance', async () => {
    const subscriberFailure = vi.fn();
    const events = createMysqlEventRuntime({
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
