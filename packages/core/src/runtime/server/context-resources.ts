export type ServerRuntimeResourceMap = Map<string, unknown>;

export const createServerRuntimeResources = (): ServerRuntimeResourceMap => new Map();

export const getOrCreateContextResource = <TValue>(
  resources: ServerRuntimeResourceMap,
  key: string,
  factory: () => Promise<TValue> | TValue,
): Promise<TValue> => {
  const cached = resources.get(key);

  if (cached) {
    return cached as Promise<TValue>;
  }

  const created = Promise.resolve().then(factory);
  resources.set(key, created);
  return created;
};

export const createContextResourceApi = (resources: ServerRuntimeResourceMap) => ({
  get: <TValue>(key: string): TValue | undefined => resources.get(key) as TValue | undefined,
  set: <TValue>(key: string, value: TValue): TValue => {
    resources.set(key, value);
    return value;
  },
  has: (key: string): boolean => resources.has(key),
  delete: (key: string): boolean => resources.delete(key),
  getOrCreate: <TValue>(key: string, factory: () => Promise<TValue> | TValue): Promise<TValue> =>
    getOrCreateContextResource(resources, key, factory),
  memoize:
    <TInput, TOutput>(options: {
      namespace: string;
      key: (input: TInput) => string;
      run: (input: TInput) => Promise<TOutput> | TOutput;
    }) =>
    (input: TInput): Promise<TOutput> =>
      getOrCreateContextResource(resources, `${options.namespace}:${options.key(input)}`, () =>
        options.run(input),
      ),
});

export type ServerContextResourceApi = ReturnType<typeof createContextResourceApi>;
