import type { JsonValue } from '../../../value/json.js';
import { cloneJson } from '../../../value/json.js';

import { requireDurableEventDelivery } from './capabilities.js';
import type {
  AnyEventDeclaration,
  DurableEventDeliveryCapability,
  EventDeliveryClaim,
  EventOccurrenceFor,
  EventRuntime,
} from './types.js';

export type EventEgressSubscription<TEvent extends AnyEventDeclaration = AnyEventDeclaration> = {
  readonly id: string;
  readonly event: TEvent;
  readonly destinationId: string;
  readonly project: (occurrence: EventOccurrenceFor<TEvent>) => JsonValue;
};

export type EventEgressAttempt<TDestination> = {
  readonly subscriptionId: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly occurrenceId: string;
  readonly deliveryId: string;
  readonly attempt: number;
  readonly destinationId: string;
  readonly destination: TDestination;
  readonly body: JsonValue;
};

export type EventEgressAttemptOutcome =
  | { readonly kind: 'accepted' }
  | {
      readonly kind: 'retryable';
      readonly reason: string;
      readonly retryAfterMs?: number;
    }
  | { readonly kind: 'rejected'; readonly reason: string };

export type EventEgressTransport<TDestination> = {
  deliver: (attempt: EventEgressAttempt<TDestination>) => Promise<EventEgressAttemptOutcome>;
};

export type EventEgressAttemptEvidence = {
  readonly subscriptionId: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly occurrenceId: string;
  readonly deliveryId: string;
  readonly attempt: number;
  readonly destinationId: string;
};

export type EventEgressProcessResult =
  | { readonly kind: 'idle'; readonly subscriptionId: string }
  | ({ readonly kind: 'accepted' } & EventEgressAttemptEvidence)
  | ({
      readonly kind: 'retryable';
      readonly reason: string;
      readonly retryAt: string;
    } & EventEgressAttemptEvidence)
  | ({ readonly kind: 'failed'; readonly reason: string } & EventEgressAttemptEvidence);

export type ProcessNextEventEgressDeliveryOptions<
  TEvent extends AnyEventDeclaration,
  TDestination,
> = {
  readonly runtime: EventRuntime;
  readonly subscription: EventEgressSubscription<TEvent>;
  readonly consumerId: string;
  readonly leaseMs: number;
  readonly retryDelayMs?: number;
  readonly now?: () => Date;
  readonly resolveDestination: (destinationId: string) => Promise<TDestination>;
  readonly transport: EventEgressTransport<TDestination>;
};

const requireNonEmpty = (value: string, name: string) => {
  if (value.trim().length === 0) throw new TypeError(`${name} must not be empty.`);
  return value;
};

export const eventEgressSubscription = <TEvent extends AnyEventDeclaration>(
  subscription: EventEgressSubscription<TEvent>,
): EventEgressSubscription<TEvent> => ({
  ...subscription,
  id: requireNonEmpty(subscription.id, 'Event egress subscription id'),
  destinationId: requireNonEmpty(subscription.destinationId, 'Event egress destination id'),
});

export const registerEventEgressSubscription = async <TEvent extends AnyEventDeclaration>(
  runtime: EventRuntime,
  subscription: EventEgressSubscription<TEvent>,
) => {
  await requireDurableEventDelivery(runtime).register({
    id: subscription.id,
    eventId: subscription.event.id,
    eventVersion: subscription.event.version,
  });
};

const releaseAfterFailure = async (
  durableDelivery: DurableEventDeliveryCapability,
  claim: EventDeliveryClaim,
  cause: unknown,
): Promise<never> => {
  try {
    await durableDelivery.release(claim);
  } catch (releaseCause) {
    throw new AggregateError(
      [cause, releaseCause],
      `Event egress attempt ${claim.delivery.deliveryId} failed and its claim could not be released.`,
    );
  }
  throw cause;
};

export const processNextEventEgressDelivery = async <
  TEvent extends AnyEventDeclaration,
  TDestination,
>({
  runtime,
  subscription,
  consumerId,
  leaseMs,
  retryDelayMs = 1_000,
  now = () => new Date(),
  resolveDestination,
  transport,
}: ProcessNextEventEgressDeliveryOptions<
  TEvent,
  TDestination
>): Promise<EventEgressProcessResult> => {
  const durableDelivery = requireDurableEventDelivery(runtime);
  const claim = await durableDelivery.claim(subscription.id, { consumerId, leaseMs });
  if (!claim) return { kind: 'idle', subscriptionId: subscription.id };

  const { delivery } = claim;
  if (
    delivery.occurrence.eventId !== subscription.event.id ||
    delivery.occurrence.eventVersion !== subscription.event.version
  ) {
    return releaseAfterFailure(
      durableDelivery,
      claim,
      new TypeError(
        `Event egress subscription ${subscription.id} expected ${subscription.event.id}@${subscription.event.version} but claimed ${delivery.occurrence.eventId}@${delivery.occurrence.eventVersion}.`,
      ),
    );
  }
  const evidence: EventEgressAttemptEvidence = {
    subscriptionId: delivery.subscriptionId,
    eventId: delivery.occurrence.eventId,
    eventVersion: delivery.occurrence.eventVersion,
    occurrenceId: delivery.occurrence.occurrenceId,
    deliveryId: delivery.deliveryId,
    attempt: delivery.attempt,
    destinationId: subscription.destinationId,
  };

  let outcome: EventEgressAttemptOutcome;
  try {
    const destination = await resolveDestination(subscription.destinationId);
    const body = cloneJson(subscription.project(delivery.occurrence as EventOccurrenceFor<TEvent>));
    outcome = await transport.deliver({ ...evidence, destination, body });
  } catch (cause) {
    return releaseAfterFailure(durableDelivery, claim, cause);
  }

  if (outcome.kind === 'accepted') {
    await durableDelivery.acknowledge(claim);
    return { kind: 'accepted', ...evidence };
  }

  if (outcome.kind === 'rejected') {
    await durableDelivery.fail(claim, { reason: outcome.reason });
    return { kind: 'failed', ...evidence, reason: outcome.reason };
  }

  const delayMs = outcome.retryAfterMs ?? retryDelayMs;
  if (!Number.isSafeInteger(delayMs) || delayMs <= 0) {
    return releaseAfterFailure(
      durableDelivery,
      claim,
      new TypeError('Event egress retry delay must be a positive safe integer.'),
    );
  }
  const retryAt = new Date(now().getTime() + delayMs).toISOString();
  await durableDelivery.retryAt(claim, retryAt);
  return {
    kind: 'retryable',
    ...evidence,
    reason: outcome.reason,
    retryAt,
  };
};
