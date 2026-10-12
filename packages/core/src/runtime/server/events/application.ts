import { cloneJson } from '../../../value/json.js';

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
