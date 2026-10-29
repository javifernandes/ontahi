import type { AnyEventDeclaration, EventApplication } from '@ontahi/core/runtime/server';
import type {
  GraphHttpEventIngressRoute,
  GraphHttpIngressProviderRegistry,
} from '@ontahi/core/runtime/server/ingress';
import { createHttpIngressHandler } from '@ontahi/runtime-http/ingress';

export type CreateNextEventIngressRouteHandlerOptions = {
  events: EventApplication<readonly AnyEventDeclaration[]>;
  route: GraphHttpEventIngressRoute;
  providers: GraphHttpIngressProviderRegistry;
  reportError?: (error: unknown, request: Request) => void;
};

const unavailableResponse = () =>
  Response.json({ ok: false, error: 'Event ingress is temporarily unavailable.' }, { status: 500 });

const responseError = async (response: Response) => {
  const body = (await response.clone().json()) as { error: string };
  return new Error(body.error);
};

export const createNextEventIngressRouteHandler = (
  options: CreateNextEventIngressRouteHandlerOptions,
) => {
  const reportError =
    options.reportError ??
    ((error: unknown) => {
      globalThis.console.error('Ontahi Next.js Event ingress failed.', error);
    });
  const handler = createHttpIngressHandler({
    providers: options.providers,
    events: { routes: [options.route], events: options.events },
  });

  return async (request: Request): Promise<Response> => {
    try {
      const response = await handler.handle(request);
      if (response.status !== 500) return response;

      reportError(await responseError(response), request);
      return unavailableResponse();
    } catch (error) {
      reportError(error, request);
      return unavailableResponse();
    }
  };
};
