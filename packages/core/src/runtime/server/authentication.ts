import { Effect } from 'effect';

import { failOperation } from './failures.js';
import { getCurrentInvocationContext, type Principal } from './invocation-context.js';
import type { OperationInput, OperationRequirement } from './operation/requirement-types.js';
import type { OperationFailure } from './operation/types.js';

export type RequirePrincipalOptions<TReason extends string = 'not_authenticated'> = {
  message?: string;
  reason?: TReason;
};

export type AuthenticatedRequirementOptions<
  TInput extends OperationInput,
  TReason extends string = 'not_authenticated',
> = {
  message?: string | ((input: TInput) => string);
  reason?: TReason;
};

export const getCurrentPrincipal = (): Principal | null =>
  getCurrentInvocationContext()?.principal ?? null;

export const requirePrincipal = <TReason extends string = 'not_authenticated'>(
  options?: RequirePrincipalOptions<TReason>,
): Effect.Effect<Principal, OperationFailure<TReason>> =>
  Effect.suspend(() => {
    const principal = getCurrentPrincipal();

    return principal
      ? Effect.succeed(principal)
      : failOperation(
          options?.reason ?? ('not_authenticated' as TReason),
          options?.message ?? 'Not authenticated',
        );
  });

export const authenticated = <
  TInput extends OperationInput = OperationInput,
  TReason extends string = 'not_authenticated',
>(
  options?: AuthenticatedRequirementOptions<TInput, TReason>,
): OperationRequirement<TInput> => ({
  run: input =>
    requirePrincipal({
      reason: options?.reason,
      message: typeof options?.message === 'function' ? options.message(input) : options?.message,
    }).pipe(Effect.asVoid),
});
