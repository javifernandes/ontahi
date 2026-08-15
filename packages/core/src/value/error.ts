export const isError = (value: unknown): value is Error => value instanceof Error;

export type SerializableErrorCause = {
  name: string;
  message: string;
  cause?: SerializableErrorCause;
};

const isErrorLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const errorLikeName = (value: Error | Record<string, unknown>) => {
  if (value instanceof Error && value.name) return value.name;
  if (typeof value.name === 'string' && value.name) return value.name;
  if ('_tag' in value && typeof value._tag === 'string' && value._tag) return value._tag;
  return 'Error';
};

const errorLikeMessage = (value: Error | Record<string, unknown>) => {
  if (value instanceof Error) return value.message;
  return typeof value.message === 'string' && value.message ? value.message : 'Unknown error';
};

const serializeErrorCause = (value: unknown, seen: Set<object>): SerializableErrorCause => {
  if (!isError(value) && !isErrorLike(value)) {
    return {
      name: 'Error',
      message: typeof value === 'string' ? value : String(value),
    };
  }

  if (seen.has(value)) {
    return {
      name: errorLikeName(value),
      message: '[Circular error cause]',
    };
  }

  seen.add(value);
  const nestedCause = 'cause' in value ? value.cause : undefined;

  return {
    name: errorLikeName(value),
    message: errorLikeMessage(value),
    ...(nestedCause === undefined ? {} : { cause: serializeErrorCause(nestedCause, seen) }),
  };
};

export const toSerializableErrorCause = (value: unknown): SerializableErrorCause =>
  serializeErrorCause(value, new Set());

export const toErrorMessage = (value: unknown, fallback?: string): string => {
  if (isError(value)) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  return String(value);
};

export const toError = (value: unknown, fallback?: string): Error =>
  isError(value) ? value : new Error(toErrorMessage(value, fallback));
