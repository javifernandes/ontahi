import {
  operationInvocationProtocolError,
  parseOperationInvocationRequest,
  type OperationInvocationDispatcher,
  type OperationInvocationProtocolResponse,
} from '@ontahi/core/runtime/operation-invocation';
import { withInvocationContext, type InvocationContextInput } from '@ontahi/core/runtime/server';
import type { Request, RequestHandler } from 'express';

export type ExpressInvocationContextFactory = (
  request: Request,
) => InvocationContextInput | Promise<InvocationContextInput>;

export type CreateExpressOperationInvocationHandlerOptions = {
  dispatcher: OperationInvocationDispatcher;
  invocationContext?: ExpressInvocationContextFactory;
  reportError?: (error: unknown, request: Request) => void;
};

const responseStatus = (response: OperationInvocationProtocolResponse) =>
  response.kind === 'protocol-error' ? 500 : 200;

export const createExpressOperationInvocationHandler =
  ({
    dispatcher,
    invocationContext,
    reportError,
  }: CreateExpressOperationInvocationHandlerOptions): RequestHandler =>
  async (request, response) => {
    const parsedRequest = parseOperationInvocationRequest(request.body);

    if (!parsedRequest.success) {
      response.status(400).json(parsedRequest.error);
      return;
    }

    try {
      const dispatch = () => dispatcher(parsedRequest.request);
      const protocolResponse = invocationContext
        ? await withInvocationContext(await invocationContext(request), dispatch)
        : await dispatch();

      response.status(responseStatus(protocolResponse)).json(protocolResponse);
    } catch (error) {
      reportError?.(error, request);
      response
        .status(500)
        .json(
          operationInvocationProtocolError(
            'invocation_unavailable',
            'Operation invocation is temporarily unavailable.',
          ),
        );
    }
  };
