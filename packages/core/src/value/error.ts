export const isError = (value: unknown): value is Error => value instanceof Error;

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
