import { cloneJson, isJsonValue, type JsonValue } from '../../value/json.js';

import {
  createRuntimeProtocolRequest,
  isRuntimeProtocolFamilyName,
  parseRuntimeProtocolRequestEnvelope,
  runtimeProtocolError,
  type RuntimeProtocolError,
  type RuntimeProtocolRequestEnvelope,
} from './envelope.js';

export type RuntimeProtocolFamilyRequestParseResult<TRequest, TError = unknown> =
  | { readonly success: true; readonly request: TRequest }
  | { readonly success: false; readonly error: TError };

export type RuntimeProtocolFamilyDefinition<
  TName extends string = string,
  TRequest = unknown,
  TError = unknown,
> = {
  readonly name: TName;
  readonly parseRequest: (
    value: unknown,
  ) => RuntimeProtocolFamilyRequestParseResult<TRequest, TError>;
};

type AnyRuntimeProtocolFamilyDefinition = RuntimeProtocolFamilyDefinition<string, unknown, unknown>;

type RuntimeProtocolRequestForFamily<TFamily> =
  TFamily extends RuntimeProtocolFamilyDefinition<infer TName, infer TRequest, unknown>
    ? RuntimeProtocolRequestEnvelope<TName, TRequest>
    : never;

export type RuntimeProtocolRegisteredRequest<TFamilies extends readonly unknown[]> =
  RuntimeProtocolRequestForFamily<TFamilies[number]>;

export type RuntimeProtocolRegistryParseResult<
  TFamilies extends readonly AnyRuntimeProtocolFamilyDefinition[],
> =
  | {
      readonly success: true;
      readonly request: RuntimeProtocolRegisteredRequest<TFamilies>;
    }
  | { readonly success: false; readonly error: RuntimeProtocolError };

export const defineRuntimeProtocolFamily = <const TName extends string, TRequest, TError = unknown>(
  definition: RuntimeProtocolFamilyDefinition<TName, TRequest, TError>,
): RuntimeProtocolFamilyDefinition<TName, TRequest, TError> => {
  if (!isRuntimeProtocolFamilyName(definition.name)) {
    throw new Error(`Invalid Runtime Protocol family name "${definition.name}".`);
  }
  return definition;
};

export const createRuntimeProtocolRegistry = <
  const TFamilies extends readonly AnyRuntimeProtocolFamilyDefinition[],
>(
  families: TFamilies,
) => {
  const familyByName = new Map<string, AnyRuntimeProtocolFamilyDefinition>();
  for (const family of families) {
    if (!isRuntimeProtocolFamilyName(family.name)) {
      throw new Error(`Invalid Runtime Protocol family name "${family.name}".`);
    }
    if (familyByName.has(family.name)) {
      throw new Error(`Duplicate Runtime Protocol family ${family.name}.`);
    }
    familyByName.set(family.name, family);
  }

  return {
    families: Object.freeze(families.map(family => family.name)),
    parseRequest: (value: unknown): RuntimeProtocolRegistryParseResult<TFamilies> => {
      const envelope = parseRuntimeProtocolRequestEnvelope(value);
      if (!envelope.success) return envelope;

      const family = familyByName.get(envelope.request.family);
      if (!family) {
        return {
          success: false,
          error: runtimeProtocolError(
            'unknown_family',
            `Unknown Runtime Protocol family ${envelope.request.family}.`,
            { id: envelope.request.id, family: envelope.request.family },
          ),
        };
      }

      const parsed = family.parseRequest(envelope.request.body);
      if (!parsed.success) {
        const details: JsonValue | undefined = isJsonValue(parsed.error)
          ? { familyError: cloneJson(parsed.error) }
          : undefined;
        return {
          success: false,
          error: runtimeProtocolError(
            'invalid_family_request',
            `Runtime Protocol family ${family.name} rejected its request body.`,
            {
              id: envelope.request.id,
              family: family.name,
              ...(details === undefined ? {} : { details }),
            },
          ),
        };
      }
      if (!isJsonValue(parsed.request)) {
        return {
          success: false,
          error: runtimeProtocolError(
            'invalid_family_request',
            `Runtime Protocol family ${family.name} produced a non-JSON request body.`,
            { id: envelope.request.id, family: family.name },
          ),
        };
      }

      return {
        success: true,
        request: createRuntimeProtocolRequest({
          id: envelope.request.id,
          family: family.name,
          body: cloneJson(parsed.request),
        }) as RuntimeProtocolRegisteredRequest<TFamilies>,
      };
    },
  };
};
