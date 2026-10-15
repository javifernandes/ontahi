export const sleep = () => Promise.resolve();

export const createHook = () => ({
  getConflict: () => Promise.resolve(null),
  then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(
      (
        globalThis as { __ontahiVercelHookResponses?: unknown[] }
      ).__ontahiVercelHookResponses?.shift(),
    ).then(resolve, reject),
  dispose: () => undefined,
});
