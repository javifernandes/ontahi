import type { InvocationContextInput } from '@ontahi/core/runtime/server';
import type { Request } from 'express';

export type ExpressInvocationContextFactory = (
  request: Request,
) => InvocationContextInput | Promise<InvocationContextInput>;
