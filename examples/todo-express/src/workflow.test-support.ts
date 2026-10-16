export const sleep = () => Promise.resolve();

export const createHook = () =>
  Object.assign(
    Promise.resolve(
      (
        globalThis as { __ontahiVercelHookResponses?: unknown[] }
      ).__ontahiVercelHookResponses?.shift(),
    ),
    {
      getConflict: () => Promise.resolve(null),
      dispose: () => undefined,
    },
  );
