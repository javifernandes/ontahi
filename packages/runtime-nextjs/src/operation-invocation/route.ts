import {
  operationInvocationProtocolError,
  parseOperationInvocationRequest,
  type OperationInvocationDispatcher,
  type OperationInvocationProtocolResponse,
} from '@ontahi/core/runtime/operation-invocation';

export type CreateNextOperationInvocationRouteHandlerOptions = {
  dispatcher: OperationInvocationDispatcher;
  reportError?: (error: unknown, request: Request) => void;
};

const responseStatus = (response: OperationInvocationProtocolResponse) =>
  response.kind === 'protocol-error' ? 500 : 200;

export const createNextOperationInvocationRouteHandler =
  ({ dispatcher, reportError }: CreateNextOperationInvocationRouteHandlerOptions) =>
  async (request: Request): Promise<Response> => {
    const parsedRequest = parseOperationInvocationRequest(await request.json().catch(() => null));

    if (!parsedRequest.success) {
      return Response.json(parsedRequest.error, { status: 400 });
    }

    try {
      const response = await dispatcher(parsedRequest.request);

      return Response.json(response, { status: responseStatus(response) });
    } catch (error) {
      reportError?.(error, request);

      return Response.json(
        operationInvocationProtocolError(
          'invocation_unavailable',
          'Operation invocation is temporarily unavailable.',
        ),
        { status: 500 },
      );
    }
  };
