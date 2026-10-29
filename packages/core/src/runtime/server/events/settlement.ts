export type DurableEventDeliverySettlement =
  | { readonly kind: 'acknowledged' }
  | { readonly kind: 'pending'; readonly availableAt?: string }
  | { readonly kind: 'failed'; readonly reason: string };

export type NormalizedDurableEventDeliverySettlement = {
  readonly state: DurableEventDeliverySettlement['kind'];
  readonly availableAt?: string;
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
    return { state: settlement.kind, failureReason: settlement.reason };
  }
  if (settlement.availableAt === undefined) return { state: settlement.kind };

  const availableAt = new Date(settlement.availableAt);
  if (Number.isNaN(availableAt.valueOf())) {
    throw new TypeError('Retry availability must be a valid timestamp.');
  }
  return { state: settlement.kind, availableAt: availableAt.toISOString() };
};
