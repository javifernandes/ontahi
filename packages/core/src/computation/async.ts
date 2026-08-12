export const isThenable = <TValue>(value: unknown): value is PromiseLike<TValue> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof (value as { then?: unknown }).then === 'function';
