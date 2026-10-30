import {
  normalizeDurableEventDeliveryInspectionQuery,
  normalizeDurableEventDeliverySettlement,
  type DurableEventDeliveryInspection,
  type DurableEventDeliveryInspectionQuery,
  type DurableEventSubscription,
  type DurableEventDeliverySettlement,
  type EventDelivery,
  type EventDeliveryClaim,
  type EventEmission,
  type EventOccurrence,
  type EventRuntime,
  type EventSubscriber,
} from '@ontahi/core/runtime/server';
import { cloneJson, isJsonValue } from '@ontahi/core/value/json';
import type { Pool, PoolClient } from 'pg';

import {
  quotePostgresEventTableNames,
  resolvePostgresEventTableNames,
  type PostgresEventTableNames,
} from './schema.js';

export type PostgresEventRuntimeOptions = {
  readonly pool: Pick<Pool, 'connect' | 'query'>;
  readonly tables?: PostgresEventTableNames;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly onSubscriberError?: (cause: unknown, delivery: EventDelivery) => void;
};

let identitySequence = 0;
const createDefaultIdentity = () =>
  globalThis.crypto?.randomUUID?.() ?? `ontahi-event-${Date.now()}-${++identitySequence}`;

const requireIdentity = (value: string, label: string) => {
  if (value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
};

const isoDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new TypeError('PostgreSQL Event timestamp is invalid.');
  return date.toISOString();
};

const occurrenceFromRow = (row: Record<string, unknown>): EventOccurrence =>
  cloneJson({
    kind: 'event-occurrence',
    occurrenceId: String(row.occurrence_id),
    eventId: String(row.event_id),
    eventVersion: Number(row.event_version),
    occurredAt: isoDate(row.occurred_at),
    payload: row.payload,
    ...(row.causation === null ? {} : { causation: row.causation }),
    ...(row.correlation === null ? {} : { correlation: row.correlation }),
  } as EventOccurrence);

const deliveryFromRow = (row: Record<string, unknown>): EventDelivery => ({
  kind: 'event-delivery',
  deliveryId: String(row.delivery_id),
  subscriptionId: String(row.subscription_id),
  attempt: Number(row.attempt),
  occurrence: occurrenceFromRow(row),
});

const deliveryInspectionFromRow = (
  row: Record<string, unknown>,
): DurableEventDeliveryInspection => ({
  kind: 'durable-event-delivery-inspection',
  deliveryId: String(row.delivery_id),
  subscriptionId: String(row.subscription_id),
  occurrenceId: String(row.occurrence_id),
  eventId: String(row.event_id),
  eventVersion: Number(row.event_version),
  state: String(row.state) as DurableEventDeliveryInspection['state'],
  attempt: Number(row.attempt),
  createdAt: isoDate(row.created_at),
  availableAt: isoDate(row.available_at),
  ...(row.lease_expires_at === null ? {} : { leaseExpiresAt: isoDate(row.lease_expires_at) }),
  ...(row.acknowledged_at === null ? {} : { acknowledgedAt: isoDate(row.acknowledged_at) }),
  ...(row.failed_at === null ? {} : { failedAt: isoDate(row.failed_at) }),
  ...(row.failure_reason === null ? {} : { failureReason: String(row.failure_reason) }),
});

const inTransaction = async <T>(
  pool: Pick<Pool, 'connect'>,
  work: (client: PoolClient) => Promise<T>,
) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (cause) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the failure that caused the transaction to roll back.
    }
    throw cause;
  } finally {
    client.release();
  }
};

const lockEventWriter = (client: PoolClient, namespace: string) =>
  client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [namespace]);

export const createPostgresEventRuntime = (options: PostgresEventRuntimeOptions): EventRuntime => {
  const tableNames = resolvePostgresEventTableNames(options.tables);
  const tables = quotePostgresEventTableNames(tableNames);
  const writerLockNamespace = `ontahi.events:${tableNames.occurrences}:${tableNames.subscriptions}:${tableNames.deliveries}`;
  const createId = options.createId ?? createDefaultIdentity;
  const subscribers = new Map<string, { eventId: string; subscriber: EventSubscriber }>();

  const accept = async (emission: EventEmission) => {
    const occurrence = cloneJson<EventOccurrence>({
      kind: 'event-occurrence',
      occurrenceId: createId(),
      eventId: emission.eventId,
      eventVersion: emission.eventVersion,
      occurredAt: (options.now ?? (() => new Date()))().toISOString(),
      payload: emission.payload,
      ...(emission.causation ? { causation: emission.causation } : {}),
      ...(emission.correlation ? { correlation: emission.correlation } : {}),
    });
    await inTransaction(options.pool, async client => {
      await lockEventWriter(client, writerLockNamespace);
      await client.query(
        `INSERT INTO ${tables.occurrences}
          (occurrence_id, event_id, event_version, occurred_at, payload, causation, correlation)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
        [
          occurrence.occurrenceId,
          occurrence.eventId,
          occurrence.eventVersion,
          occurrence.occurredAt,
          JSON.stringify(occurrence.payload),
          occurrence.causation ? JSON.stringify(occurrence.causation) : null,
          occurrence.correlation ? JSON.stringify(occurrence.correlation) : null,
        ],
      );
      await client.query(
        `INSERT INTO ${tables.deliveries} (delivery_id, subscription_id, occurrence_id)
         SELECT 'ontahi-delivery:' || subscription_id || ':' || $1, subscription_id, $1
         FROM ${tables.subscriptions}
         WHERE active = true
           AND event_id = $2
           AND event_version = $3
           AND ($4::jsonb @> correlation)
         ON CONFLICT (subscription_id, occurrence_id) DO NOTHING`,
        [
          occurrence.occurrenceId,
          occurrence.eventId,
          occurrence.eventVersion,
          JSON.stringify(occurrence.correlation ?? {}),
        ],
      );
    });

    await Promise.all(
      [...subscribers.entries()]
        .filter(([, subscription]) => subscription.eventId === occurrence.eventId)
        .map(async ([subscriptionId, subscription]) => {
          const delivery: EventDelivery = {
            kind: 'event-delivery',
            deliveryId: createId(),
            subscriptionId,
            attempt: 1,
            occurrence,
          };
          try {
            await subscription.subscriber(cloneJson(delivery));
          } catch (cause) {
            try {
              options.onSubscriberError?.(cause, delivery);
            } catch {
              // Diagnostic reporting cannot turn delivery failure into publication failure.
            }
          }
        }),
    );
    return occurrence;
  };

  const register = async (subscription: DurableEventSubscription) => {
    requireIdentity(subscription.id, 'Durable Event subscription id');
    requireIdentity(subscription.eventId, 'Durable Event id');
    if (!Number.isInteger(subscription.eventVersion) || subscription.eventVersion < 1) {
      throw new TypeError('Durable Event version must be a positive integer.');
    }
    if (subscription.correlation !== undefined && !isJsonValue(subscription.correlation)) {
      throw new TypeError('Durable Event correlation must be JSON-safe.');
    }
    await inTransaction(options.pool, async client => {
      await lockEventWriter(client, writerLockNamespace);
      await client.query(
        `INSERT INTO ${tables.subscriptions}
          (subscription_id, event_id, event_version, correlation, active)
         VALUES ($1, $2, $3, $4::jsonb, true)
         ON CONFLICT (subscription_id) DO NOTHING`,
        [
          subscription.id,
          subscription.eventId,
          subscription.eventVersion,
          JSON.stringify(subscription.correlation ?? {}),
        ],
      );
      const existing = await client.query(
        `SELECT subscription_id
         FROM ${tables.subscriptions}
         WHERE subscription_id = $1
           AND event_id = $2
           AND event_version = $3
           AND correlation = $4::jsonb`,
        [
          subscription.id,
          subscription.eventId,
          subscription.eventVersion,
          JSON.stringify(subscription.correlation ?? {}),
        ],
      );
      if (existing.rowCount !== 1) {
        throw new TypeError(
          `Durable Event subscription ${subscription.id} is already registered differently.`,
        );
      }
      await client.query(
        `UPDATE ${tables.subscriptions} SET active = true WHERE subscription_id = $1`,
        [subscription.id],
      );
      await client.query(
        `INSERT INTO ${tables.deliveries} (delivery_id, subscription_id, occurrence_id)
         SELECT 'ontahi-delivery:' || $1 || ':' || occurrence_id, $1, occurrence_id
         FROM ${tables.occurrences}
         WHERE event_id = $2
           AND event_version = $3
           AND (COALESCE(correlation, '{}'::jsonb) @> $4::jsonb)
         ON CONFLICT (subscription_id, occurrence_id) DO NOTHING`,
        [
          subscription.id,
          subscription.eventId,
          subscription.eventVersion,
          JSON.stringify(subscription.correlation ?? {}),
        ],
      );
    });
  };

  const claim = async (
    subscriptionId: string,
    claimOptions: { readonly consumerId: string; readonly leaseMs: number },
  ): Promise<EventDeliveryClaim | undefined> => {
    requireIdentity(subscriptionId, 'Durable Event subscription id');
    requireIdentity(claimOptions.consumerId, 'Durable Event consumer id');
    if (!Number.isSafeInteger(claimOptions.leaseMs) || claimOptions.leaseMs <= 0) {
      throw new TypeError('Durable Event claim lease must be a positive safe integer.');
    }
    const claimId = createId();
    const result = await options.pool.query(
      `WITH candidate AS (
         SELECT delivery.delivery_id
         FROM ${tables.deliveries} AS delivery
         JOIN ${tables.occurrences} AS occurrence USING (occurrence_id)
         WHERE delivery.subscription_id = $1
           AND ((delivery.state = 'pending' AND delivery.available_at <= now())
             OR (delivery.state = 'claimed' AND delivery.lease_expires_at <= now()))
         ORDER BY occurrence.acceptance_order
         FOR UPDATE OF delivery SKIP LOCKED
         LIMIT 1
       ), claimed AS (
         UPDATE ${tables.deliveries} AS delivery
         SET state = 'claimed', claim_id = $2, claimed_by = $3,
             lease_expires_at = now() + ($4 * interval '1 millisecond'),
             attempt = attempt + 1
         FROM candidate
         WHERE delivery.delivery_id = candidate.delivery_id
         RETURNING delivery.*
       )
       SELECT claimed.*, occurrence.event_id, occurrence.event_version, occurrence.occurred_at,
              occurrence.payload, occurrence.causation, occurrence.correlation
       FROM claimed
       JOIN ${tables.occurrences} AS occurrence USING (occurrence_id)`,
      [subscriptionId, claimId, claimOptions.consumerId, claimOptions.leaseMs],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      claimId,
      consumerId: claimOptions.consumerId,
      leaseExpiresAt: isoDate(row.lease_expires_at),
      delivery: deliveryFromRow(row),
    };
  };

  const settle = async (
    claimValue: EventDeliveryClaim,
    outcome: DurableEventDeliverySettlement,
  ) => {
    const {
      state,
      retryAfterMs,
      failureReason = null,
    } = normalizeDurableEventDeliverySettlement(outcome);
    const result = await options.pool.query(
      `UPDATE ${tables.deliveries}
       SET state = $1,
           acknowledged_at = CASE WHEN $1 = 'acknowledged' THEN now() ELSE NULL END,
           available_at = now() + (COALESCE($6::bigint, 0) * interval '1 millisecond'),
           failed_at = CASE WHEN $1 = 'failed' THEN now() ELSE NULL END,
           failure_reason = CASE WHEN $1 = 'failed' THEN $7::text ELSE NULL END,
           claim_id = NULL, claimed_by = NULL, lease_expires_at = NULL
       WHERE delivery_id = $2
         AND subscription_id = $3
         AND state = 'claimed'
         AND claim_id = $4
         AND claimed_by = $5
         AND lease_expires_at > now()`,
      [
        state,
        claimValue.delivery.deliveryId,
        claimValue.delivery.subscriptionId,
        claimValue.claimId,
        claimValue.consumerId,
        retryAfterMs,
        failureReason,
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Durable Event claim ${claimValue.claimId} is stale or already settled.`);
    }
  };

  const inspectDeliveries = async (
    subscriptionId: string,
    inspectionQuery: DurableEventDeliveryInspectionQuery,
  ) => {
    requireIdentity(subscriptionId, 'Durable Event subscription id');
    const query = normalizeDurableEventDeliveryInspectionQuery(inspectionQuery);
    const result = await options.pool.query(
      `SELECT delivery.delivery_id, delivery.subscription_id, delivery.occurrence_id,
              occurrence.event_id, occurrence.event_version, delivery.state, delivery.attempt,
              delivery.created_at, delivery.available_at, delivery.lease_expires_at,
              delivery.acknowledged_at, delivery.failed_at, delivery.failure_reason
       FROM ${tables.deliveries} AS delivery
       JOIN ${tables.occurrences} AS occurrence USING (occurrence_id)
       WHERE delivery.subscription_id = $1
         AND ($2::text[] IS NULL OR delivery.state = ANY($2::text[]))
       ORDER BY delivery.created_at DESC, delivery.delivery_id DESC
       LIMIT $3`,
      [subscriptionId, query.states ?? null, query.limit],
    );
    return result.rows.map(row => deliveryInspectionFromRow(row as Record<string, unknown>));
  };

  return {
    capabilities: {
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
    },
    accept,
    subscribe: (eventId, subscriber) => {
      requireIdentity(eventId, 'Event id');
      const id = createId();
      subscribers.set(id, { eventId, subscriber });
      let active = true;
      return {
        id,
        cancel: () => {
          if (!active) return;
          active = false;
          subscribers.delete(id);
        },
      };
    },
    deliveryInspection: { inspect: inspectDeliveries },
    durableDelivery: {
      register,
      claim,
      acknowledge: claimValue => settle(claimValue, { kind: 'acknowledged' }),
      release: claimValue => settle(claimValue, { kind: 'pending' }),
      retryAfter: (claimValue, retryAfterMs) =>
        settle(claimValue, { kind: 'pending', retryAfterMs }),
      fail: (claimValue, failure) => settle(claimValue, { kind: 'failed', reason: failure.reason }),
      cancel: async subscriptionId => {
        requireIdentity(subscriptionId, 'Durable Event subscription id');
        await options.pool.query(
          `UPDATE ${tables.subscriptions} SET active = false WHERE subscription_id = $1`,
          [subscriptionId],
        );
      },
    },
  };
};
