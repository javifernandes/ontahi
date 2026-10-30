import type { DurableEventDeliveryInspectionQuery, DurableEventDeliveryState } from './types.js';

const states = new Set<DurableEventDeliveryState>(['pending', 'claimed', 'acknowledged', 'failed']);

export const MAX_DURABLE_EVENT_DELIVERY_INSPECTION_LIMIT = 100;

export const normalizeDurableEventDeliveryInspectionQuery = (
  query: DurableEventDeliveryInspectionQuery,
): DurableEventDeliveryInspectionQuery => {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1) {
    throw new TypeError('Durable Event delivery inspection limit must be a positive safe integer.');
  }
  if (query.limit > MAX_DURABLE_EVENT_DELIVERY_INSPECTION_LIMIT) {
    throw new TypeError(
      `Durable Event delivery inspection limit cannot exceed ${MAX_DURABLE_EVENT_DELIVERY_INSPECTION_LIMIT}.`,
    );
  }
  const normalizedStates = [...new Set(query.states ?? [])];
  if (normalizedStates.some(state => !states.has(state))) {
    throw new TypeError('Durable Event delivery inspection state is invalid.');
  }
  return {
    limit: query.limit,
    ...(normalizedStates.length === 0 ? {} : { states: normalizedStates }),
  };
};
