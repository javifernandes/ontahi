import type { GraphSchemaLike } from '../../../data-graph/index.js';
import { safeParseUnknownGraphSchema, toGraphSchemaDescriptor } from '../../../data-graph/index.js';
import { cloneJson, isJsonValue } from '../../../value/json.js';
import { isRecord } from '../../../value/object.js';

import type {
  AnyEventDeclaration,
  EventDeclaration,
  EventEmission,
  ReflectedEventDeclaration,
} from './types.js';

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
  return {
    kind: 'event-declaration',
    ...options,
    emit: payload => {
      const parsed = safeParseUnknownGraphSchema(options.payload, payload);
      if (!parsed.success) throw new TypeError(`Invalid payload for Event ${options.id}.`);
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
