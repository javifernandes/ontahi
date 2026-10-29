export const MAX_DURABLE_EVENT_RETRY_DELAY_MS = 2_147_483_647;

export type DurableEventDeliverySettlement =
  | { readonly kind: 'acknowledged' }
  | { readonly kind: 'pending'; readonly retryAfterMs?: number }
  | { readonly kind: 'failed'; readonly reason: string };

export type NormalizedDurableEventDeliverySettlement = {
  readonly state: DurableEventDeliverySettlement['kind'];
  readonly retryAfterMs?: number;
  readonly failureReason?: string;
};

export const normalizeDurableEventDeliverySettlement = (
  settlement: DurableEventDeliverySettlement,
): NormalizedDurableEventDeliverySettlement => {
  if (settlement.kind === 'acknowledged') return { state: settlement.kind };
  if (settlement.kind === 'failed') {
    if (settlement.reason.trim().length === 0) {
      throw new TypeError('Failure reason must be a non-empty string.');
    }
    return { state: settlement.kind, failureReason: settlement.reason.slice(0, 1_024) };
  }
  if (settlement.retryAfterMs === undefined) return { state: settlement.kind };

  if (
    !Number.isSafeInteger(settlement.retryAfterMs) ||
    settlement.retryAfterMs <= 0 ||
    settlement.retryAfterMs > MAX_DURABLE_EVENT_RETRY_DELAY_MS
  ) {
    throw new TypeError(
      `Retry delay must be a positive safe integer no greater than ${MAX_DURABLE_EVENT_RETRY_DELAY_MS}.`,
    );
  }
  return { state: settlement.kind, retryAfterMs: settlement.retryAfterMs };
};
