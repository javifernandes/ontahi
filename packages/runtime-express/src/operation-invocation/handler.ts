import {
  operationInvocationProtocolError,
  parseOperationInvocationRequest,
  type OperationInvocationDispatcher,
  type OperationInvocationProtocolResponse,
} from '@ontahi/core/runtime/operation-invocation';
import type { Request, RequestHandler } from 'express';

export type CreateExpressOperationInvocationHandlerOptions = {
  dispatcher: OperationInvocationDispatcher;
  reportError?: (error: unknown, request: Request) => void;
};

const responseStatus = (response: OperationInvocationProtocolResponse) =>
  response.kind === 'protocol-error' ? 500 : 200;

export const createExpressOperationInvocationHandler =
  ({ dispatcher, reportError }: CreateExpressOperationInvocationHandlerOptions): RequestHandler =>
  async (request, response) => {
    const parsedRequest = parseOperationInvocationRequest(request.body);

    if (!parsedRequest.success) {
      response.status(400).json(parsedRequest.error);
      return;
    }

    try {
      const protocolResponse = await dispatcher(parsedRequest.request);

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
