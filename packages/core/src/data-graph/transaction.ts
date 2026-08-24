export interface DataGraphTransactionCapability<TRuntime, TTransactionError = never> {
  transaction<TResult, TWorkError = never, TRequirements = never>(
    work: (runtime: TRuntime) => import('effect').Effect.Effect<TResult, TWorkError, TRequirements>,
  ): import('effect').Effect.Effect<TResult, TTransactionError | TWorkError, TRequirements>;
}

export class DataGraphTransactionUnavailableError extends Error {
  readonly _tag = 'DataGraphTransactionUnavailableError';

  constructor() {
    super('The current Data Graph runtime does not support compositional transactions.');
    this.name = 'DataGraphTransactionUnavailableError';
  }
}

export const isDataGraphTransactionCapability = <TRuntime = unknown, TError = unknown>(
  value: unknown,
): value is DataGraphTransactionCapability<TRuntime, TError> =>
  typeof value === 'object' &&
  value !== null &&
  'transaction' in value &&
  typeof value.transaction === 'function';
