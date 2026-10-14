import { cloneJson, isJsonValue } from '../../../value/json.js';
import { isRecord } from '../../../value/object.js';

import { reflectEventDeclaration, validateEventEmission } from './declaration.js';
import type {
  AnyEventDeclaration,
  EventApplication,
  EventCausation,
  EventDelivery,
  EventEmission,
  EventOccurrence,
  EventRuntime,
} from './types.js';

export const createEventApplication = <TEvents extends readonly AnyEventDeclaration[]>(options: {
  declarations: TEvents;
  runtime: EventRuntime;
}): {
  api: EventApplication<TEvents>;
  publish: (emission: EventEmission, causation?: EventCausation) => Promise<EventOccurrence>;
} => {
  const declarations = new Map<string, AnyEventDeclaration>();
  for (const declaration of options.declarations) {
    if (declarations.has(declaration.id)) {
      throw new Error(`Event ${declaration.id} is declared more than once.`);
    }
    declarations.set(declaration.id, declaration);
  }
  const assertRegistered = (declaration: AnyEventDeclaration) => {
    const registered = declarations.get(declaration.id);
    if (registered !== declaration || registered.version !== declaration.version) {
      throw new TypeError(`Event ${declaration.id} is not registered by this application.`);
    }
  };
  const assertIngress = (ingress: {
    readonly provider: string;
    readonly receivedAt: string;
    readonly event?: string;
    readonly deliveryId?: string;
  }) => {
    if (ingress.provider.trim().length === 0) {
      throw new TypeError('Event ingress provider must be a non-empty string.');
    }
    if (Number.isNaN(Date.parse(ingress.receivedAt))) {
      throw new TypeError('Event ingress receivedAt must be a valid timestamp.');
    }
    if (ingress.event !== undefined && ingress.event.trim().length === 0) {
      throw new TypeError('Event ingress event must be a non-empty string when provided.');
    }
    if (ingress.deliveryId !== undefined && ingress.deliveryId.trim().length === 0) {
      throw new TypeError('Event ingress deliveryId must be a non-empty string when provided.');
    }
  };
  const ingestByIdentity = async (input: {
    readonly eventId: string;
    readonly eventVersion: number;
    readonly payload: unknown;
    readonly ingress: {
      readonly provider: string;
      readonly receivedAt: string;
      readonly event?: string;
      readonly deliveryId?: string;
    };
    readonly correlation?: Readonly<Record<string, import('../../../value/json.js').JsonValue>>;
  }) => {
    assertIngress(input.ingress);
    if (
      input.correlation !== undefined &&
      (!isRecord(input.correlation) || !isJsonValue(input.correlation))
    ) {
      throw new TypeError('Event ingress correlation must be a JSON-safe object.');
    }
    return options.runtime.accept(
      validateEventEmission(declarations, {
        kind: 'event-emission',
        eventId: input.eventId,
        eventVersion: input.eventVersion,
        payload: input.payload as never,
        causation: { kind: 'ingress', ...input.ingress },
        ...(input.correlation ? { correlation: input.correlation } : {}),
      }),
    );
  };
  return {
    api: {
      capabilities: options.runtime.capabilities,
      declarations: () => [...declarations.values()].map(reflectEventDeclaration).map(cloneJson),
      subscribe: (declaration, subscriber) => {
        assertRegistered(declaration);
        return options.runtime.subscribe(
          declaration.id,
          subscriber as (delivery: EventDelivery) => void | Promise<void>,
        );
      },
      subscribeByIdentity: (eventId, eventVersion, subscriber) => {
        const declaration = declarations.get(eventId);
        if (!declaration || declaration.version !== eventVersion) {
          throw new TypeError(
            `Event ${eventId}@${eventVersion} is not registered by this application.`,
          );
        }
        return options.runtime.subscribe(eventId, subscriber);
      },
      ingest: async (declaration, input) => {
        assertRegistered(declaration);
        return (await ingestByIdentity({
          eventId: declaration.id,
          eventVersion: declaration.version,
          ...input,
        })) as never;
      },
      ingestByIdentity,
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
