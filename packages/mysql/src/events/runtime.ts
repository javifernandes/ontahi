import type {
  DurableEventSubscription,
  EventDelivery,
  EventDeliveryClaim,
  EventEmission,
  EventOccurrence,
  EventRuntime,
  EventSubscriber,
} from '@ontahi/core/runtime/server';
import { cloneJson, isJsonValue } from '@ontahi/core/value/json';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import {
  quoteMysqlEventTableNames,
  resolveMysqlEventTableNames,
  type MysqlEventTableNames,
} from './schema.js';

export type MysqlEventRuntimePool = Pick<Pool, 'getConnection' | 'query'>;

export type MysqlEventRuntimeOptions = {
  readonly pool: MysqlEventRuntimePool;
  readonly tables?: MysqlEventTableNames;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly onSubscriberError?: (cause: unknown, delivery: EventDelivery) => void;
};

let identitySequence = 0;
const createDefaultIdentity = () =>
  globalThis.crypto?.randomUUID?.() ?? `ontahi-event-${Date.now()}-${++identitySequence}`;

const requireIdentity = (value: string, label: string) => {
  if (value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string.`);
};

const isoDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new TypeError('MySQL Event timestamp is invalid.');
  return date.toISOString();
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
    occurredAt: isoDate(row.occurred_at),
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
  const tableNames = resolveMysqlEventTableNames(options.tables);
  const tables = quoteMysqlEventTableNames(tableNames);
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
           AND (delivery.state = 'pending'
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
        leaseExpiresAt: isoDate(row.lease_expires_at),
        delivery: deliveryFromRow(row),
      };
    });
  };

  const settle = async (claimValue: EventDeliveryClaim, state: 'acknowledged' | 'pending') => {
    const acknowledged = state === 'acknowledged';
    const [result] = await options.pool.query<ResultSetHeader>(
      `UPDATE ${tables.deliveries}
       SET state = ?, acknowledged_at = ${acknowledged ? 'CURRENT_TIMESTAMP(3)' : 'NULL'},
           claim_id = NULL, claimed_by = NULL, lease_expires_at = NULL
       WHERE delivery_id = ?
         AND subscription_id = ?
         AND state = 'claimed'
         AND claim_id = ?
         AND claimed_by = ?
         AND lease_expires_at > CURRENT_TIMESTAMP(3)`,
      [
        state,
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

  return {
    capabilities: {
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
    durableDelivery: {
      register,
      claim,
      acknowledge: claimValue => settle(claimValue, 'acknowledged'),
      release: claimValue => settle(claimValue, 'pending'),
      cancel: async subscriptionId => {
        requireIdentity(subscriptionId, 'Durable Event subscription id');
        await options.pool.query(
          `UPDATE ${tables.subscriptions} SET active = false WHERE subscription_id = ?`,
          [subscriptionId],
        );
      },
    },
  };
};
