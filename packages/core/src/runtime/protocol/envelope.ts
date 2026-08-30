import { cloneJson, isJsonValue, type JsonValue } from '../../value/json.js';
import { isRecord } from '../../value/object.js';

export const RUNTIME_PROTOCOL_NAME = 'ontahi.runtime' as const;
export const RUNTIME_PROTOCOL_VERSION = 1 as const;

export type RuntimeProtocolRequestEnvelope<TFamily extends string = string, TBody = JsonValue> = {
  readonly protocol: typeof RUNTIME_PROTOCOL_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_VERSION;
  readonly id: string;
  readonly kind: 'request';
  readonly family: TFamily;
  readonly body: TBody;
};

export type RuntimeProtocolResponseEnvelope<TFamily extends string = string, TBody = JsonValue> = {
  readonly protocol: typeof RUNTIME_PROTOCOL_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_VERSION;
  readonly id: string;
  readonly kind: 'response';
  readonly family: TFamily;
  readonly body: TBody;
};

export type RuntimeProtocolErrorCode =
  | 'invalid_envelope'
  | 'unsupported_version'
  | 'unknown_family'
  | 'invalid_family_request'
  | 'invalid_response';

export type RuntimeProtocolError = {
  readonly protocol: typeof RUNTIME_PROTOCOL_NAME;
  readonly version: typeof RUNTIME_PROTOCOL_VERSION;
  readonly id?: string;
  readonly kind: 'protocol-error';
  readonly family?: string;
  readonly error: {
    readonly code: RuntimeProtocolErrorCode;
    readonly message: string;
    readonly details?: JsonValue;
  };
};

export type RuntimeProtocolRequestEnvelopeParseResult =
  | {
      readonly success: true;
      readonly request: RuntimeProtocolRequestEnvelope;
    }
  | {
      readonly success: false;
      readonly error: RuntimeProtocolError;
    };

export type RuntimeProtocolResponseParseResult =
  | {
      readonly success: true;
      readonly response: RuntimeProtocolResponseEnvelope | RuntimeProtocolError;
    }
  | {
      readonly success: false;
      readonly error: RuntimeProtocolError;
    };

const runtimeProtocolErrorCodes = new Set<RuntimeProtocolErrorCode>([
  'invalid_envelope',
  'unsupported_version',
  'unknown_family',
  'invalid_family_request',
  'invalid_response',
]);

const requestKeys = new Set(['protocol', 'version', 'id', 'kind', 'family', 'body']);
const responseKeys = new Set(['protocol', 'version', 'id', 'kind', 'family', 'body']);
const protocolErrorKeys = new Set(['protocol', 'version', 'id', 'kind', 'family', 'error']);
const protocolErrorDetailKeys = new Set(['code', 'message', 'details']);

const hasOnlyKeys = (record: Record<string, unknown>, keys: ReadonlySet<string>) =>
  Object.keys(record).every(key => keys.has(key));

const isRequestId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 256;

export const isRuntimeProtocolFamilyName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 128 &&
  /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/.test(value);

type RuntimeProtocolErrorContext = {
  readonly id?: string;
  readonly family?: string;
  readonly details?: JsonValue;
};

export const runtimeProtocolError = (
  code: RuntimeProtocolErrorCode,
  message: string,
  context: RuntimeProtocolErrorContext = {},
): RuntimeProtocolError =>
  cloneJson({
    protocol: RUNTIME_PROTOCOL_NAME,
    version: RUNTIME_PROTOCOL_VERSION,
    ...(context.id === undefined ? {} : { id: context.id }),
    kind: 'protocol-error',
    ...(context.family === undefined ? {} : { family: context.family }),
    error: {
      code,
      message,
      ...(context.details === undefined ? {} : { details: context.details }),
    },
  });

export const isRuntimeProtocolError = (value: unknown): value is RuntimeProtocolError =>
  isRecord(value) &&
  hasOnlyKeys(value, protocolErrorKeys) &&
  value.protocol === RUNTIME_PROTOCOL_NAME &&
  value.version === RUNTIME_PROTOCOL_VERSION &&
  value.kind === 'protocol-error' &&
  (value.id === undefined || isRequestId(value.id)) &&
  (value.family === undefined || isRuntimeProtocolFamilyName(value.family)) &&
  isRecord(value.error) &&
  hasOnlyKeys(value.error, protocolErrorDetailKeys) &&
  typeof value.error.code === 'string' &&
  runtimeProtocolErrorCodes.has(value.error.code as RuntimeProtocolErrorCode) &&
  typeof value.error.message === 'string' &&
  (value.error.details === undefined || isJsonValue(value.error.details)) &&
  isJsonValue(value);

const invalidEnvelope = (
  message: string,
  value?: Record<string, unknown>,
): RuntimeProtocolRequestEnvelopeParseResult => ({
  success: false,
  error: runtimeProtocolError('invalid_envelope', message, {
    ...(value && isRequestId(value.id) ? { id: value.id } : {}),
    ...(value && isRuntimeProtocolFamilyName(value.family) ? { family: value.family } : {}),
  }),
});

export const parseRuntimeProtocolRequestEnvelope = (
  value: unknown,
): RuntimeProtocolRequestEnvelopeParseResult => {
  if (!isRecord(value)) {
    return invalidEnvelope('Runtime Protocol request envelope must be an object.');
  }
  if (value.protocol !== RUNTIME_PROTOCOL_NAME) {
    return invalidEnvelope(`Runtime Protocol name must be "${RUNTIME_PROTOCOL_NAME}".`, value);
  }
  if (value.version !== RUNTIME_PROTOCOL_VERSION) {
    return {
      success: false,
      error: runtimeProtocolError(
        'unsupported_version',
        `Unsupported Runtime Protocol envelope version: ${String(value.version)}.`,
        {
          ...(isRequestId(value.id) ? { id: value.id } : {}),
          ...(isRuntimeProtocolFamilyName(value.family) ? { family: value.family } : {}),
        },
      ),
    };
  }
  if (!hasOnlyKeys(value, requestKeys)) {
    return invalidEnvelope('Runtime Protocol request envelope contains unknown keys.', value);
  }
  if (value.kind !== 'request') {
    return invalidEnvelope('Runtime Protocol request kind must be "request".', value);
  }
  if (!isRequestId(value.id)) {
    return invalidEnvelope(
      'Runtime Protocol request id must be a non-empty string of at most 256 characters.',
      value,
    );
  }
  if (!isRuntimeProtocolFamilyName(value.family)) {
    return invalidEnvelope('Runtime Protocol request family name is invalid.', value);
  }
  if (!isJsonValue(value.body) || !isJsonValue(value)) {
    return invalidEnvelope('Runtime Protocol request envelope must be JSON-safe.', value);
  }

  return {
    success: true,
    request: cloneJson(value) as RuntimeProtocolRequestEnvelope,
  };
};

export const createRuntimeProtocolRequest = <const TFamily extends string, TBody>(input: {
  readonly id: string;
  readonly family: TFamily;
  readonly body: TBody;
}): RuntimeProtocolRequestEnvelope<TFamily, TBody> => {
  const parsed = parseRuntimeProtocolRequestEnvelope({
    protocol: RUNTIME_PROTOCOL_NAME,
    version: RUNTIME_PROTOCOL_VERSION,
    id: input.id,
    kind: 'request',
    family: input.family,
    body: input.body,
  });
  if (!parsed.success) throw new TypeError(parsed.error.error.message);
  return parsed.request as RuntimeProtocolRequestEnvelope<TFamily, TBody>;
};

export const createRuntimeProtocolResponse = <const TFamily extends string, TBody>(
  request: Pick<RuntimeProtocolRequestEnvelope<TFamily>, 'id' | 'family'>,
  body: TBody,
): RuntimeProtocolResponseEnvelope<TFamily, TBody> => {
  const response = {
    protocol: RUNTIME_PROTOCOL_NAME,
    version: RUNTIME_PROTOCOL_VERSION,
    id: request.id,
    kind: 'response',
    family: request.family,
    body,
  } as const;
  if (!isJsonValue(response)) {
    throw new TypeError('Runtime Protocol response envelope must be JSON-safe.');
  }
  return cloneJson(response);
};

const invalidResponse = <TFamily extends string>(
  request: Pick<RuntimeProtocolRequestEnvelope<TFamily>, 'id' | 'family'>,
  message: string,
): RuntimeProtocolResponseParseResult => ({
  success: false,
  error: runtimeProtocolError('invalid_response', message, {
    id: request.id,
    family: request.family,
  }),
});

export const parseRuntimeProtocolResponse = <TFamily extends string>(
  value: unknown,
  request: Pick<RuntimeProtocolRequestEnvelope<TFamily>, 'id' | 'family'>,
): RuntimeProtocolResponseParseResult => {
  if (isRuntimeProtocolError(value)) {
    if (value.id !== request.id || value.family !== request.family) {
      return invalidResponse(request, 'Runtime Protocol error correlation does not match request.');
    }
    return { success: true, response: cloneJson(value) };
  }
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, responseKeys) ||
    value.protocol !== RUNTIME_PROTOCOL_NAME ||
    value.version !== RUNTIME_PROTOCOL_VERSION ||
    value.kind !== 'response' ||
    value.id !== request.id ||
    value.family !== request.family ||
    !isJsonValue(value.body) ||
    !isJsonValue(value)
  ) {
    return invalidResponse(request, 'Runtime Protocol response is invalid or mismatched.');
  }

  return {
    success: true,
    response: cloneJson(value) as RuntimeProtocolResponseEnvelope,
  };
};
