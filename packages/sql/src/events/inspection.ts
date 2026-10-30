import {
  normalizeDurableEventDeliveryInspectionQuery,
  type DurableEventDeliveryInspection,
  type DurableEventDeliveryInspectionQuery,
} from '@ontahi/core/runtime/server';

export type SqlEventTimestampMaterializer = (value: unknown) => string;

const requiredString = (value: unknown, field: string, provider: string) => {
  if (typeof value !== 'string') {
    throw new TypeError(`${provider} Event delivery ${field} is invalid.`);
  }
  return value;
};

const requiredNumber = (value: unknown, field: string, provider: string) => {
  if (typeof value !== 'number') {
    throw new TypeError(`${provider} Event delivery ${field} is invalid.`);
  }
  return value;
};

const deliveryStates = new Set<DurableEventDeliveryInspection['state']>([
  'pending',
  'claimed',
  'acknowledged',
  'failed',
]);

const deliveryState = (value: unknown, provider: string) => {
  if (
    typeof value !== 'string' ||
    !deliveryStates.has(value as DurableEventDeliveryInspection['state'])
  ) {
    throw new TypeError(`${provider} Event delivery state is invalid.`);
  }
  return value as DurableEventDeliveryInspection['state'];
};

export const materializeDurableEventDeliveryInspection = (
  row: Readonly<Record<string, unknown>>,
  timestamp: SqlEventTimestampMaterializer,
  provider: string,
): DurableEventDeliveryInspection => {
  if (row.failure_reason !== null && typeof row.failure_reason !== 'string') {
    throw new TypeError(`${provider} Event delivery failure reason is invalid.`);
  }
  return {
    kind: 'durable-event-delivery-inspection',
    deliveryId: requiredString(row.delivery_id, 'identity', provider),
    subscriptionId: requiredString(row.subscription_id, 'subscription identity', provider),
    occurrenceId: requiredString(row.occurrence_id, 'occurrence identity', provider),
    eventId: requiredString(row.event_id, 'Event identity', provider),
    eventVersion: requiredNumber(row.event_version, 'Event version', provider),
    state: deliveryState(row.state, provider),
    attempt: requiredNumber(row.attempt, 'attempt', provider),
    createdAt: timestamp(row.created_at),
    availableAt: timestamp(row.available_at),
    ...(row.lease_expires_at === null ? {} : { leaseExpiresAt: timestamp(row.lease_expires_at) }),
    ...(row.acknowledged_at === null ? {} : { acknowledgedAt: timestamp(row.acknowledged_at) }),
    ...(row.failed_at === null ? {} : { failedAt: timestamp(row.failed_at) }),
    ...(row.failure_reason === null ? {} : { failureReason: row.failure_reason }),
  };
};

export const inspectSqlEventDeliveries = async (options: {
  readonly query: DurableEventDeliveryInspectionQuery;
  readonly loadRows: (
    query: DurableEventDeliveryInspectionQuery,
  ) => Promise<readonly Readonly<Record<string, unknown>>[]>;
  readonly timestamp: SqlEventTimestampMaterializer;
  readonly provider: string;
}) => {
  const query = normalizeDurableEventDeliveryInspectionQuery(options.query);
  const rows = await options.loadRows(query);
  return rows.map(row =>
    materializeDurableEventDeliveryInspection(row, options.timestamp, options.provider),
  );
};
