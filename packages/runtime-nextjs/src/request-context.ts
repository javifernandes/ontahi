import type { InvocationContextInput } from '@ontahi/core/runtime/server';

export type NextInvocationContextFactory = (
  request: Request,
) => InvocationContextInput | Promise<InvocationContextInput>;
