import type {
  GraphSchemaDescriptor,
  GraphSchemaLike,
  InferGraphSchemaClientInput,
} from '../../data-graph/index.js';
import {
  safeParseUnknownGraphSchema,
  toGraphSchemaDescriptor,
} from '../../data-graph/index.js';
import { cloneJson, isJsonValue, type JsonValue } from '../../value/json.js';
import { isRecord } from '../../value/object.js';

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

export type AnyEventDeclaration = {
  readonly kind: 'event-declaration';
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly payload: GraphSchemaLike<any>;
  emit: (payload: any) => EventEmission;
};

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
  readonly attempt: 1;
  readonly occurrence: EventOccurrence<TPayload>;
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

export type EventSubscription = {
  readonly id: string;
  cancel: () => void;
};

export type EventSubscriber = (delivery: EventDelivery) => void | Promise<void>;

export type EventRuntime = {
  readonly capabilities: EventRuntimeCapabilities;
  accept: (emission: EventEmission) => Promise<EventOccurrence>;
  subscribe: (eventId: string, subscriber: EventSubscriber) => EventSubscription;
};

export type InMemoryEventRuntimeOptions = {
  readonly capacity?: number;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly onSubscriberError?: (cause: unknown, delivery: EventDelivery) => void;
};

let eventIdentitySequence = 0;
const createDefaultEventIdentity = () =>
  globalThis.crypto?.randomUUID?.() ?? `ontahi-event-${Date.now()}-${++eventIdentitySequence}`;

export const createInMemoryEventRuntime = (
  options: InMemoryEventRuntimeOptions = {},
): EventRuntime => {
  const capacity = options.capacity ?? 1024;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new TypeError('In-memory Event Runtime capacity must be a positive integer.');
  }
  const createId = options.createId ?? createDefaultEventIdentity;
  const subscriptions = new Map<string, { eventId: string; subscriber: EventSubscriber }>();
  let pending = 0;

  return {
    capabilities: {
      liveSubscription: true,
      retention: false,
      replay: false,
      durableAcceptance: false,
      durableDelivery: false,
      acknowledgement: false,
      ordering: 'acceptance',
      deduplication: false,
      atomicPublication: false,
      overflowBehavior: 'reject',
    },
    accept: async emission => {
      if (pending >= capacity) {
        throw new Error('In-memory Event Runtime capacity exceeded.');
      }
      pending += 1;
      try {
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
        const deliveries = [...subscriptions.entries()]
          .filter(([, subscription]) => subscription.eventId === occurrence.eventId)
          .map(([subscriptionId, subscription]) => {
            const delivery = cloneJson<EventDelivery>({
              kind: 'event-delivery',
              deliveryId: createId(),
              subscriptionId,
              attempt: 1,
              occurrence,
            });
            return Promise.resolve()
              .then(() => subscription.subscriber(delivery))
              .catch(cause => {
                try {
                  options.onSubscriberError?.(cause, delivery);
                } catch {
                  // Diagnostic reporting cannot turn subscriber failure into publication failure.
                }
              });
          });
        await Promise.all(deliveries);
        return occurrence;
      } finally {
        pending -= 1;
      }
    },
    subscribe: (eventId, subscriber) => {
      const id = createId();
      subscriptions.set(id, { eventId, subscriber });
      let active = true;
      return {
        id,
        cancel: () => {
          if (!active) return;
          active = false;
          subscriptions.delete(id);
        },
      };
    },
  };
};

const assertEventIdentity = (id: string, version: number) => {
  if (id.length === 0) throw new TypeError('Event declarations require a non-empty id.');
  if (!Number.isInteger(version) || version < 1) {
    throw new TypeError('Event declaration version must be a positive integer.');
  }
};

export const defineEvent = <
  const TId extends string,
  const TVersion extends number,
  const TPayloadSchema extends GraphSchemaLike,
>(options: {
  id: TId;
  version: TVersion;
  description: string;
  payload: TPayloadSchema;
}): EventDeclaration<TId, TVersion, TPayloadSchema> => {
  assertEventIdentity(options.id, options.version);
  if (options.description.length === 0) {
    throw new TypeError('Event declarations require a non-empty description.');
  }
  const declaration: EventDeclaration<TId, TVersion, TPayloadSchema> = {
    kind: 'event-declaration',
    ...options,
    emit: payload => {
      const parsed = safeParseUnknownGraphSchema(options.payload, payload);
      if (!parsed.success) {
        throw new TypeError(`Invalid payload for Event ${options.id}.`);
      }
      if (!isJsonValue(parsed.data)) {
        throw new TypeError(`Event ${options.id} payload must be JSON-safe.`);
      }
      return cloneJson({
        kind: 'event-emission',
        eventId: options.id,
        eventVersion: options.version,
        payload: parsed.data,
      });
    },
  };
  return declaration;
};

export const eventDeclaration = { define: defineEvent };

export const reflectEventDeclaration = (
  declaration: AnyEventDeclaration,
): ReflectedEventDeclaration => ({
  id: declaration.id,
  version: declaration.version,
  description: declaration.description,
  payload: toGraphSchemaDescriptor(declaration.payload as never),
});

export const isEventEmission = (value: unknown): value is EventEmission =>
  isRecord(value) &&
  isJsonValue(value) &&
  value.kind === 'event-emission' &&
  typeof value.eventId === 'string' &&
  Number.isInteger(value.eventVersion) &&
  'payload' in value;

export const validateEventEmission = (
  declarations: ReadonlyMap<string, AnyEventDeclaration>,
  emission: EventEmission,
): EventEmission => {
  const declaration = declarations.get(emission.eventId);
  if (!declaration) throw new TypeError(`Unknown Event ${emission.eventId}.`);
  if (declaration.version !== emission.eventVersion) {
    throw new TypeError(
      `Event ${emission.eventId} requires version ${declaration.version}; received ${emission.eventVersion}.`,
    );
  }
  const parsed = safeParseUnknownGraphSchema(declaration.payload, emission.payload);
  if (!parsed.success || !isJsonValue(parsed.data)) {
    throw new TypeError(`Invalid payload for Event ${emission.eventId}.`);
  }
  return cloneJson({ ...emission, payload: parsed.data });
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
};

export const createEventApplication = <TEvents extends readonly AnyEventDeclaration[]>(options: {
  declarations: TEvents;
  runtime: EventRuntime;
}): {
  api: EventApplication<TEvents>;
  publish: (emission: EventEmission, causation?: EventCausation) => Promise<EventOccurrence>;
} => {
  const declarations = new Map<string, AnyEventDeclaration>();
  for (const declaration of options.declarations) {
    const existing = declarations.get(declaration.id);
    if (existing) throw new Error(`Event ${declaration.id} is declared more than once.`);
    declarations.set(declaration.id, declaration);
  }
  const assertRegistered = (declaration: AnyEventDeclaration) => {
    const registered = declarations.get(declaration.id);
    if (registered !== declaration || registered.version !== declaration.version) {
      throw new TypeError(`Event ${declaration.id} is not registered by this application.`);
    }
  };
  return {
    api: {
      capabilities: options.runtime.capabilities,
      declarations: () =>
        [...declarations.values()].map(reflectEventDeclaration).map(cloneJson),
      subscribe: (declaration, subscriber) => {
        assertRegistered(declaration);
        return options.runtime.subscribe(
          declaration.id,
          subscriber as (delivery: EventDelivery) => void | Promise<void>,
        );
      },
    },
    publish: async (emission, causation) =>
      options.runtime.accept(
        validateEventEmission(declarations, {
          ...emission,
          ...(causation && !emission.causation ? { causation } : {}),
        }),
      ),
  };
};
