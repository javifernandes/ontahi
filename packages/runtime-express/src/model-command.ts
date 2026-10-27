import {
  ModelInterpretationError,
  projectCurrentResourceEvidence,
  withInvocationContext,
  type ModelCommandRuntime,
} from '@ontahi/core/runtime/server';
import type { RequestHandler } from 'express';

import type { ExpressInvocationContextFactory } from './request-context.js';

export const createModelCommandHandler =
  (runtime: ModelCommandRuntime, context?: ExpressInvocationContextFactory): RequestHandler =>
  async (request, response, next) => {
    const controller = new AbortController();
    const cancel = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on('close', cancel);
    try {
      const value = await withInvocationContext(
        (await context?.(request)) ?? { principal: null },
        async () => {
          const result = await runtime.submit(request.body, controller.signal);
          const { resourceUsage, ...semanticResult } = result;
          const resourceEvidence = projectCurrentResourceEvidence(resourceUsage);
          return {
            ...semanticResult,
            ...(resourceEvidence === undefined ? {} : { resourceEvidence }),
          };
        },
      );
      response.json({ ok: true, value });
    } catch (error) {
      if (error instanceof ModelInterpretationError)
        response
          .status(error.code === 'command_unauthorized' ? 403 : 400)
          .json({ ok: false, message: error.message, code: error.code });
      else next(error);
    } finally {
      response.off('close', cancel);
    }
  };
