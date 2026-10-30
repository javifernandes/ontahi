import {
  normalizeDurableEventDeliverySettlement,
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
import { inspectSqlEventDeliveries } from '@ontahi/sql/events';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import {
  quoteMysqlEventTableNames,
  resolveMysqlEventTableNames,
  type MysqlEventTableNames,
} from './schema.js';

export type MysqlEventRuntimePool = Pick<Pool, 'getConnection' | 'query'>;

export interface MysqlEventRuntimeOptions {
  readonly pool: MysqlEventRuntimePool;
  readonly tables?: MysqlEventTableNames;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly onSubscriberError?: (cause: unknown, delivery: EventDelivery) => void;
}

let identitySequence = 0;
const createMysqlEventIdentity = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) return uuid;
  identitySequence += 1;
  return `ontahi-event-${Date.now()}-${identitySequence}`;
};

const requireIdentity = (value: string, label: string) => {
  if (value.trim()) return value;
  throw new TypeError(`${label} must be a non-empty string.`);
};

const mysqlTimestampToIso = (value: unknown) => {
  const normalized = value instanceof Date ? value : new Date(String(value));
  if (!Number.isNaN(normalized.valueOf())) return normalized.toISOString();
  throw new TypeError('MySQL Event timestamp is invalid.');
};

const jsonValue = (value: unknown) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new TypeError('MySQL Event JSON value is invalid.');
  }
};

const occurrenceFromRow = (row: Record<string, unknown>): EventOccurrence =>
  cloneJson({
    kind: 'event-occurrence',
    occurrenceId: String(row.occurrence_id),
    eventId: String(row.event_id),
    eventVersion: Number(row.event_version),
    occurredAt: mysqlTimestampToIso(row.occurred_at),
    payload: jsonValue(row.payload),
    ...(row.causation === null ? {} : { causation: jsonValue(row.causation) }),
    ...(row.correlation === null ? {} : { correlation: jsonValue(row.correlation) }),
  } as EventOccurrence);

const deliveryFromRow = (row: Record<string, unknown>): EventDelivery => ({
  kind: 'event-delivery',
  deliveryId: String(row.delivery_id),
  subscriptionId: String(row.subscription_id),
  attempt: Number(row.attempt),
  occurrence: occurrenceFromRow(row),
});

type LiveSubscriber = { readonly eventId: string; readonly subscriber: EventSubscriber };

const createOccurrence = (
  emission: EventEmission,
  occurrenceId: string,
  occurredAt: string,
): EventOccurrence =>
  cloneJson({
    kind: 'event-occurrence',
    occurrenceId,
    eventId: emission.eventId,
    eventVersion: emission.eventVersion,
    occurredAt,
    payload: emission.payload,
    ...(emission.causation === undefined ? {} : { causation: emission.causation }),
    ...(emission.correlation === undefined ? {} : { correlation: emission.correlation }),
  });

const deliverToLiveSubscribers = async (
  subscribers: ReadonlyMap<string, LiveSubscriber>,
  occurrence: EventOccurrence,
  createId: () => string,
  reportError?: MysqlEventRuntimeOptions['onSubscriberError'],
) => {
  const matching = [...subscribers].filter(([, value]) => value.eventId === occurrence.eventId);
  await Promise.all(
    matching.map(async ([subscriptionId, { subscriber }]) => {
      const delivery: EventDelivery = {
        kind: 'event-delivery',
        deliveryId: createId(),
        subscriptionId,
        attempt: 1,
        occurrence,
      };
      try {
        await subscriber(cloneJson(delivery));
      } catch (cause) {
        try {
          reportError?.(cause, delivery);
        } catch {
          // Diagnostic reporting cannot turn delivery failure into publication failure.
        }
      }
    }),
  );
};

const inTransaction = async <T>(
  pool: Pick<Pool, 'getConnection'>,
  work: (connection: PoolConnection) => Promise<T>,
) => {
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.query('START TRANSACTION');
    const result = await work(connection);
    await connection.query('COMMIT');
    return result;
  } catch (cause) {
    try {
      await connection.query('ROLLBACK');
    } catch {
      // Preserve the failure that caused the transaction to roll back.
    }
    throw cause;
  } finally {
    connection.release();
  }
};

const withWriterTransaction = async <T>(
  pool: Pick<Pool, 'getConnection'>,
  namespace: string,
  work: (connection: PoolConnection) => Promise<T>,
) => {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [lockRows] = await connection.query<RowDataPacket[]>(
      'SELECT GET_LOCK(SHA2(?, 256), 10) AS acquired',
      [namespace],
    );
    locked = Number(lockRows[0]?.acquired) === 1;
    if (!locked) throw new Error('MySQL Event writer lock could not be acquired.');
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.query('START TRANSACTION');
    const result = await work(connection);
    await connection.query('COMMIT');
    return result;
  } catch (cause) {
    try {
      await connection.query('ROLLBACK');
    } catch {
      // Preserve the original transaction or lock failure.
    }
    throw cause;
  } finally {
    if (locked) {
      try {
        await connection.query('SELECT RELEASE_LOCK(SHA2(?, 256))', [namespace]);
      } catch {
        // Closing the connection also releases its user-level locks.
        connection.destroy();
      }
    }
    connection.release();
  }
};

export const createMysqlEventRuntime = (options: MysqlEventRuntimeOptions): EventRuntime => {
  const resolvedNames = resolveMysqlEventTableNames(options.tables);
  const tables = quoteMysqlEventTableNames(resolvedNames);
  const writerLockNamespace = [
    'ontahi.events',
    resolvedNames.occurrences,
    resolvedNames.subscriptions,
    resolvedNames.deliveries,
  ].join(':');
  const createId = options.createId ?? createMysqlEventIdentity;
  const subscribers = new Map<string, LiveSubscriber>();
  const currentTime = options.now ?? (() => new Date());

  const accept = async (emission: EventEmission) => {
    const occurrence = createOccurrence(emission, createId(), currentTime().toISOString());
    await withWriterTransaction(options.pool, writerLockNamespace, async connection => {
      await connection.query(
        `INSERT INTO ${tables.occurrences}
          (occurrence_id, event_id, event_version, occurred_at, payload, causation, correlation)
         VALUES (?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))`,
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
      await connection.query(
        `INSERT INTO ${tables.deliveries} (delivery_id, subscription_id, occurrence_id)
         SELECT CONCAT('ontahi-delivery:', SHA2(CONCAT(subscription_id, CHAR(0), ?), 256)),
                subscription_id, ?
         FROM ${tables.subscriptions}
         WHERE active = true
           AND event_id = ?
           AND event_version = ?
           AND JSON_CONTAINS(CAST(? AS JSON), correlation)
         ON DUPLICATE KEY UPDATE delivery_id = delivery_id`,
        [
          occurrence.occurrenceId,
          occurrence.occurrenceId,
          occurrence.eventId,
          occurrence.eventVersion,
          JSON.stringify(occurrence.correlation ?? {}),
        ],
      );
    });

    await deliverToLiveSubscribers(subscribers, occurrence, createId, options.onSubscriberError);
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
    const correlation = JSON.stringify(subscription.correlation ?? {});
    await withWriterTransaction(options.pool, writerLockNamespace, async connection => {
      await connection.query(
        `INSERT INTO ${tables.subscriptions}
          (subscription_id, event_id, event_version, correlation, active)
         VALUES (?, ?, ?, CAST(? AS JSON), true)
         ON DUPLICATE KEY UPDATE subscription_id = subscription_id`,
        [subscription.id, subscription.eventId, subscription.eventVersion, correlation],
      );
      const [existing] = await connection.query<RowDataPacket[]>(
        `SELECT subscription_id
         FROM ${tables.subscriptions}
         WHERE subscription_id = ?
           AND event_id = ?
           AND event_version = ?
           AND JSON_CONTAINS(correlation, CAST(? AS JSON))
           AND JSON_CONTAINS(CAST(? AS JSON), correlation)`,
        [
          subscription.id,
          subscription.eventId,
          subscription.eventVersion,
          correlation,
          correlation,
        ],
      );
      if (existing.length !== 1) {
        throw new TypeError(
          `Durable Event subscription ${subscription.id} is already registered differently.`,
        );
      }
      await connection.query(
        `UPDATE ${tables.subscriptions} SET active = true WHERE subscription_id = ?`,
        [subscription.id],
      );
      await connection.query(
        `INSERT INTO ${tables.deliveries} (delivery_id, subscription_id, occurrence_id)
         SELECT CONCAT('ontahi-delivery:', SHA2(CONCAT(?, CHAR(0), occurrence_id), 256)),
                ?, occurrence_id
         FROM ${tables.occurrences}
         WHERE event_id = ?
           AND event_version = ?
           AND JSON_CONTAINS(COALESCE(correlation, JSON_OBJECT()), CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE delivery_id = delivery_id`,
        [
          subscription.id,
          subscription.id,
          subscription.eventId,
          subscription.eventVersion,
          correlation,
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
    return inTransaction(options.pool, async connection => {
      const [candidates] = await connection.query<RowDataPacket[]>(
        `SELECT delivery.delivery_id
         FROM ${tables.deliveries} AS delivery
         JOIN ${tables.occurrences} AS occurrence USING (occurrence_id)
         WHERE delivery.subscription_id = ?
           AND ((delivery.state = 'pending' AND delivery.available_at <= CURRENT_TIMESTAMP(3))
             OR (delivery.state = 'claimed' AND delivery.lease_expires_at <= CURRENT_TIMESTAMP(3)))
         ORDER BY occurrence.acceptance_order
         LIMIT 1
         FOR UPDATE OF delivery SKIP LOCKED`,
        [subscriptionId],
      );
      const deliveryId = candidates[0]?.delivery_id;
      if (deliveryId === undefined) return undefined;
      await connection.query(
        `UPDATE ${tables.deliveries}
         SET state = 'claimed', claim_id = ?, claimed_by = ?,
             lease_expires_at = TIMESTAMPADD(MICROSECOND, ? * 1000, CURRENT_TIMESTAMP(3)),
             attempt = attempt + 1
         WHERE delivery_id = ?`,
        [claimId, claimOptions.consumerId, claimOptions.leaseMs, deliveryId],
      );
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT delivery.*, occurrence.event_id, occurrence.event_version,
                occurrence.occurred_at, occurrence.payload, occurrence.causation,
                occurrence.correlation
         FROM ${tables.deliveries} AS delivery
         JOIN ${tables.occurrences} AS occurrence USING (occurrence_id)
         WHERE delivery.delivery_id = ?`,
        [deliveryId],
      );
      const row = rows[0] as Record<string, unknown>;
      return {
        claimId,
        consumerId: claimOptions.consumerId,
        leaseExpiresAt: mysqlTimestampToIso(row.lease_expires_at),
        delivery: deliveryFromRow(row),
      };
    });
  };

  const settle = async (
    claimValue: EventDeliveryClaim,
    outcome: DurableEventDeliverySettlement,
  ) => {
    const { state, retryAfterMs, failureReason } = normalizeDurableEventDeliverySettlement(outcome);
    const [result] = await options.pool.query<ResultSetHeader>(
      `UPDATE ${tables.deliveries}
       SET state = ?,
           acknowledged_at = ${state === 'acknowledged' ? 'CURRENT_TIMESTAMP(3)' : 'NULL'},
           available_at = TIMESTAMPADD(MICROSECOND, ? * 1000, CURRENT_TIMESTAMP(3)),
           failed_at = ${state === 'failed' ? 'CURRENT_TIMESTAMP(3)' : 'NULL'},
           failure_reason = ${state === 'failed' ? '?' : 'NULL'},
           claim_id = NULL, claimed_by = NULL, lease_expires_at = NULL
       WHERE delivery_id = ?
         AND subscription_id = ?
         AND state = 'claimed'
         AND claim_id = ?
         AND claimed_by = ?
         AND lease_expires_at > CURRENT_TIMESTAMP(3)`,
      [
        state,
        retryAfterMs ?? 0,
        ...(failureReason === undefined ? [] : [failureReason]),
        claimValue.delivery.deliveryId,
        claimValue.delivery.subscriptionId,
        claimValue.claimId,
        claimValue.consumerId,
      ],
    );
    if (result.affectedRows !== 1) {
      throw new Error(`Durable Event claim ${claimValue.claimId} is stale or already settled.`);
    }
  };

  const subscribe = (eventId: string, subscriber: EventSubscriber) => {
    requireIdentity(eventId, 'Event id');
    const subscriptionId = createId();
    subscribers.set(subscriptionId, { eventId, subscriber });
    let cancelled = false;
    return {
      id: subscriptionId,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        subscribers.delete(subscriptionId);
      },
    };
  };

  const cancelDurableSubscription = async (subscriptionId: string) => {
    requireIdentity(subscriptionId, 'Durable Event subscription id');
    await options.pool.query(
      `UPDATE ${tables.subscriptions} SET active = false WHERE subscription_id = ?`,
      [subscriptionId],
    );
  };

  const inspectDeliveries = async (
    subscriptionId: string,
    inspectionQuery: DurableEventDeliveryInspectionQuery,
  ) => {
    requireIdentity(subscriptionId, 'Durable Event subscription id');
    return inspectSqlEventDeliveries({
      query: inspectionQuery,
      timestamp: mysqlTimestampToIso,
      provider: 'MySQL',
      loadRows: async query => {
        const stateFilter = query.states?.map(() => '?').join(', ');
        const [rows] = await options.pool.query<RowDataPacket[]>(
          `SELECT delivery.delivery_id, delivery.subscription_id, delivery.occurrence_id,
                  occurrence.event_id, occurrence.event_version, delivery.state, delivery.attempt,
                  delivery.created_at, delivery.available_at, delivery.lease_expires_at,
                  delivery.acknowledged_at, delivery.failed_at, delivery.failure_reason
           FROM ${tables.deliveries} AS delivery
           JOIN ${tables.occurrences} AS occurrence USING (occurrence_id)
           WHERE delivery.subscription_id = ?
           ${stateFilter === undefined ? '' : `AND delivery.state IN (${stateFilter})`}
           ORDER BY delivery.created_at DESC, delivery.delivery_id DESC
           LIMIT ?`,
          [subscriptionId, ...(query.states ?? []), query.limit],
        );
        return rows;
      },
    });
  };

  const capabilities = {
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
  } as const;

  return {
    capabilities,
    accept,
    subscribe,
    deliveryInspection: { inspect: inspectDeliveries },
    durableDelivery: {
      register,
      claim,
      acknowledge: claimValue => settle(claimValue, { kind: 'acknowledged' }),
      release: claimValue => settle(claimValue, { kind: 'pending' }),
      retryAfter: (claimValue, retryAfterMs) =>
        settle(claimValue, { kind: 'pending', retryAfterMs }),
      fail: (claimValue, failure) => settle(claimValue, { kind: 'failed', reason: failure.reason }),
      cancel: cancelDurableSubscription,
    },
  };
};
