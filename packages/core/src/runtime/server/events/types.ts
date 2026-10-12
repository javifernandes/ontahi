import type {
  GraphSchemaDescriptor,
  GraphSchemaLike,
  InferGraphSchemaClientInput,
} from '../../../data-graph/index.js';
import type { JsonValue } from '../../../value/json.js';

export type EventDeclaration<
  TId extends string = string,
  TVersion extends number = number,
  TPayloadSchema extends GraphSchemaLike = GraphSchemaLike,
> = {
  readonly kind: 'event-declaration';
  readonly id: TId;
  readonly version: TVersion;
  readonly description: string;
  readonly payload: TPayloadSchema;
  emit: (payload: InferGraphSchemaClientInput<TPayloadSchema>) => EventEmission<TId, TVersion>;
};

export type AnyEventDeclaration = EventDeclaration<string, number, GraphSchemaLike<any>>;

export type ReflectedEventDeclaration = {
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly payload: GraphSchemaDescriptor;
};

export type MutationEventCausation = {
  readonly kind: 'mutation-outcome';
  readonly outcomeId: string;
  readonly rootOutcomeId: string;
  readonly parentOutcomeId?: string;
};

export type OperationEventCausation = {
  readonly kind: 'operation';
  readonly scope: string;
  readonly taskRun?: { readonly taskId: string; readonly runId: string };
};
export type EventCausation = MutationEventCausation | OperationEventCausation;

export type EventEmission<TId extends string = string, TVersion extends number = number> = {
  readonly kind: 'event-emission';
  readonly eventId: TId;
  readonly eventVersion: TVersion;
  readonly payload: JsonValue;
  readonly causation?: EventCausation;
  readonly correlation?: Readonly<Record<string, JsonValue>>;
};

export type EventOccurrence<TPayload extends JsonValue = JsonValue> = {
  readonly kind: 'event-occurrence';
  readonly occurrenceId: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly occurredAt: string;
  readonly payload: TPayload;
  readonly causation?: EventCausation;
  readonly correlation?: Readonly<Record<string, JsonValue>>;
};

export type EventDelivery<TPayload extends JsonValue = JsonValue> = {
  readonly kind: 'event-delivery';
  readonly deliveryId: string;
  readonly subscriptionId: string;
  readonly attempt: number;
  readonly occurrence: EventOccurrence<TPayload>;
};

export type DurableEventSubscription = {
  readonly id: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly correlation?: Readonly<Record<string, JsonValue>>;
};

export type EventDeliveryClaim = {
  readonly claimId: string;
  readonly consumerId: string;
  readonly leaseExpiresAt: string;
  readonly delivery: EventDelivery;
};

export type DurableEventDeliveryCapability = {
  register: (subscription: DurableEventSubscription) => Promise<void>;
  claim: (
    subscriptionId: string,
    options: { readonly consumerId: string; readonly leaseMs: number },
  ) => Promise<EventDeliveryClaim | undefined>;
  acknowledge: (claim: EventDeliveryClaim) => Promise<void>;
  release: (claim: EventDeliveryClaim) => Promise<void>;
  cancel: (subscriptionId: string) => Promise<void>;
};

export type EventRuntimeCapabilities = {
  readonly liveSubscription: boolean;
  readonly retention: boolean;
  readonly replay: boolean;
  readonly durableAcceptance: boolean;
  readonly durableDelivery: boolean;
  readonly acknowledgement: boolean;
  readonly ordering: 'none' | 'acceptance' | 'event' | 'key' | 'subscription' | 'global';
  readonly deduplication: boolean;
  readonly atomicPublication: boolean;
  readonly overflowBehavior: 'block' | 'drop' | 'reject' | 'spill' | 'disconnect';
};

export type EventSubscription = { readonly id: string; cancel: () => void };
export type EventSubscriber = (delivery: EventDelivery) => void | Promise<void>;
export type EventRuntime = {
  readonly capabilities: EventRuntimeCapabilities;
  accept: (emission: EventEmission) => Promise<EventOccurrence>;
  subscribe: (eventId: string, subscriber: EventSubscriber) => EventSubscription;
  readonly durableDelivery?: DurableEventDeliveryCapability;
};

export type EventPayload<TEvent extends AnyEventDeclaration> = InferGraphSchemaClientInput<
  TEvent['payload']
>;
export type EventOccurrenceFor<TEvent extends AnyEventDeclaration> = Omit<
  EventOccurrence,
  'eventId' | 'eventVersion' | 'payload'
> & {
  readonly eventId: TEvent['id'];
  readonly eventVersion: TEvent['version'];
  readonly payload: EventPayload<TEvent> & JsonValue;
};
export type EventDeliveryFor<TEvent extends AnyEventDeclaration> = Omit<
  EventDelivery,
  'occurrence'
> & { readonly occurrence: EventOccurrenceFor<TEvent> };

export type EventApplication<TEvents extends readonly AnyEventDeclaration[]> = {
  readonly capabilities: EventRuntimeCapabilities;
  declarations: () => readonly ReflectedEventDeclaration[];
  subscribe: <TEvent extends TEvents[number]>(
    declaration: TEvent,
    subscriber: (delivery: EventDeliveryFor<TEvent>) => void | Promise<void>,
  ) => EventSubscription;
  /** @internal Runtime Protocol bridge; prefer typed `subscribe` in application code. */
  subscribeByIdentity: (
    eventId: string,
    eventVersion: number,
    subscriber: EventSubscriber,
  ) => EventSubscription;
};
