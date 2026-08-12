import { toErrorMessage } from '@ontahi/core/value/error';
import { isRecord } from '@ontahi/core/value/object';

export const DEFAULT_ACTION_ERROR_MESSAGE = 'Something went wrong.';

export type ActionResultLike = {
  data?: unknown;
  serverError?: unknown;
  validationErrors?: unknown;
  thrownError?: unknown;
};

export type ActionDataResult<TData> =
  | {
      success: true;
      data: TData;
    }
  | {
      success: false;
      error: string;
    };

export type ActionDataOf<TAction> = TAction extends (...args: any[]) => Promise<infer TResult>
  ? TResult extends { data?: infer TData }
    ? TData
    : never
  : never;

export type ActionItemOf<TAction> =
  ActionDataOf<TAction> extends Array<infer TItem> ? TItem : never;

export type ActionDataResponseOf<TAction> = Promise<ActionDataResult<ActionDataOf<TAction>>>;

const getValidationErrors = (validationErrors: unknown) => {
  if (!isRecord(validationErrors)) {
    return undefined;
  }

  const formErrors = Array.isArray(validationErrors.formErrors)
    ? validationErrors.formErrors.filter((error): error is string => typeof error === 'string')
    : [];
  const rawFieldErrors = isRecord(validationErrors.fieldErrors) ? validationErrors.fieldErrors : {};
  const fieldErrors = Object.fromEntries(
    Object.entries(rawFieldErrors).map(([field, errors]) => [
      field,
      Array.isArray(errors)
        ? errors.filter((error): error is string => typeof error === 'string')
        : undefined,
    ]),
  ) as Record<string, string[] | undefined>;

  return { formErrors, fieldErrors };
};

export const getActionErrorMessage = (
  result: ActionResultLike,
  fallbackMessage: string = DEFAULT_ACTION_ERROR_MESSAGE,
) => {
  if (typeof result.serverError === 'string' && result.serverError.length > 0) {
    return result.serverError;
  }

  const validationErrors = getValidationErrors(result.validationErrors);
  const formError = validationErrors?.formErrors[0];
  if (formError) {
    return formError;
  }

  const fieldError = Object.values(validationErrors?.fieldErrors ?? {}).find(errors =>
    Array.isArray(errors) && errors.length > 0 ? errors[0] : undefined,
  );
  if (fieldError?.[0]) {
    return fieldError[0];
  }

  if (result.thrownError !== undefined) {
    return toErrorMessage(result.thrownError, fallbackMessage);
  }

  return fallbackMessage;
};

export class ActionResultError extends Error {
  readonly name = 'ActionResultError';

  constructor(
    readonly result: ActionResultLike,
    fallbackMessage: string = DEFAULT_ACTION_ERROR_MESSAGE,
  ) {
    super(getActionErrorMessage(result, fallbackMessage));
  }
}

export const hasActionError = (result: ActionResultLike) =>
  Boolean(result.serverError || result.validationErrors || result.thrownError);

export const unwrapActionData = <TData>(
  result: ActionResultLike & {
    data?: TData;
  },
  fallbackMessage: string = DEFAULT_ACTION_ERROR_MESSAGE,
) => {
  if (hasActionError(result)) {
    throw new ActionResultError(result, fallbackMessage);
  }

  return result.data as TData;
};

export const toActionSuccessResult = <TData extends Record<string, unknown>>(
  result: ActionResultLike & {
    data?: TData;
  },
  fallbackMessage: string = DEFAULT_ACTION_ERROR_MESSAGE,
): ({ success: true } & TData) | { success: false; error: string } => {
  if (hasActionError(result) || !result.data) {
    return {
      success: false,
      error: getActionErrorMessage(result, fallbackMessage),
    };
  }

  return {
    success: true,
    ...result.data,
  };
};

export const toActionDataResult = <TData>(
  result: ActionResultLike & {
    data?: TData;
  },
  fallbackMessage: string = DEFAULT_ACTION_ERROR_MESSAGE,
): ActionDataResult<TData> => {
  if (hasActionError(result) || !('data' in result)) {
    return {
      success: false,
      error: getActionErrorMessage(result, fallbackMessage),
    };
  }

  return {
    success: true,
    data: result.data as TData,
  };
};
