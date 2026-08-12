import 'server-only';

import {
  createMiddleware,
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from 'next-safe-action';
import { z } from 'zod';

export const actionMetadataSchema = z.object({
  actionName: z.string().min(1),
  feature: z.string().min(1),
  requiresAuth: z.boolean().optional(),
});

export type ActionMetadata = z.infer<typeof actionMetadataSchema>;

export class UserFacingActionError extends Error {
  readonly name = 'UserFacingActionError';
}

export type CreateNextActionTransportOptions<TAuthContext extends object> = {
  getAuthContext: () => Promise<TAuthContext | null | undefined>;
  handleServerError?: (args: {
    error: unknown;
    metadata: ActionMetadata | undefined;
    defaultMessage: string;
  }) => string;
  notAuthenticatedMessage?: string;
};

export const createNextActionTransport = <TAuthContext extends object>(
  options: CreateNextActionTransportOptions<TAuthContext>,
) => {
  const baseActionClient = createSafeActionClient({
    defineMetadataSchema: () => actionMetadataSchema,
    defaultValidationErrorsShape: 'flattened',
    handleServerError: (error, { metadata }) => {
      if (error instanceof UserFacingActionError) {
        return error.message;
      }

      return (
        options.handleServerError?.({
          error,
          metadata,
          defaultMessage: DEFAULT_SERVER_ERROR_MESSAGE,
        }) ?? DEFAULT_SERVER_ERROR_MESSAGE
      );
    },
  });

  const authMiddleware = createMiddleware<{
    serverError: string;
    ctx: object;
    metadata: ActionMetadata;
  }>().define(async ({ next }) => {
    const authContext = await options.getAuthContext();

    if (!authContext) {
      throw new UserFacingActionError(options.notAuthenticatedMessage ?? 'Not authenticated');
    }

    return next({ ctx: authContext });
  });

  return {
    actionClient: baseActionClient,
    authActionClient: baseActionClient.use(authMiddleware),
  };
};

export const withActionMetadata = <Client extends { metadata: (data: ActionMetadata) => any }>(
  client: Client,
  metadata: ActionMetadata,
): ReturnType<Client['metadata']> => client.metadata(metadata);
