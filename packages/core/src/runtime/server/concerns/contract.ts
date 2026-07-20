import { Effect } from 'effect';
import type { IValidation } from 'typia';
import type { ZodIssue, ZodType } from 'zod';

import { toEffect } from '../../../computation/effect.js';
import { createOperationFailure } from '../failures.js';
import { isEffectSuccessPayload } from '../intents.js';
import type { LayerConcern, LayerConcernRuntime } from '../layer-types.js';
import type { OperationInput } from '../operation/requirement-types.js';
import type { OperationFailure } from '../operation/types.js';

import type {
  ContractCheckFailure,
  OperationContracts,
  ContractPostCheck,
  ContractPreCheck,
} from './contract-types.js';

export type ValidationResult<TValue, TIssue = unknown> =
  | { success: true; data: TValue }
  | { success: false; errors: ReadonlyArray<TIssue> };

export interface ContractFromValidationOptions<
  TInput extends OperationInput,
  TIssue,
  TReason extends string = 'invalid_input',
> {
  reason?: TReason;
  formatMessage?: (errors: ReadonlyArray<TIssue>, input: TInput) => string;
}

export type ContractFromTypiaOptions<
  TInput extends OperationInput,
  TReason extends string = 'invalid_input',
> = ContractFromValidationOptions<TInput, IValidation.IError, TReason>;

export type ContractFromZodOptions<
  TInput extends OperationInput,
  TReason extends string = 'invalid_input',
> = ContractFromValidationOptions<TInput, ZodIssue, TReason>;

type TypiaValidationFieldName<TInput extends OperationInput> = Extract<keyof TInput, string>;

export type TypiaFieldMessageRule =
  | string
  | {
      default: string;
      expectedIncludes?: Record<string, string | ((error: IValidation.IError) => string)>;
    };

export interface CreateTypiaValidationMessageFormatterOptions {
  defaultMessage?: string;
  pathPrefix?: string;
}

export interface TypiaRequiredStringMessageOptions {
  requiredMessage?: string;
  maxLength?: number;
  maxLengthMessage?: string;
}

export const typiaFieldMessage = {
  invalid: (fieldName: string): TypiaFieldMessageRule => `${fieldName} is invalid.`,
  required: (fieldName: string): TypiaFieldMessageRule => ({
    default: `${fieldName} is required.`,
  }),
  requiredString: (
    fieldName: string,
    options?: TypiaRequiredStringMessageOptions,
  ): TypiaFieldMessageRule => ({
    default: options?.requiredMessage ?? `${fieldName} is required.`,
    expectedIncludes: options?.maxLength
      ? {
          [`MaxLength<${options.maxLength}>`]:
            options.maxLengthMessage ?? `${fieldName} exceeds ${options.maxLength} characters.`,
        }
      : undefined,
  }),
};

const toReadonlyArray = <TValue>(
  value: TValue | ReadonlyArray<TValue> | undefined,
): ReadonlyArray<TValue> => {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? (value as ReadonlyArray<TValue>) : [value as TValue];
};

const normalizeContractFailures = <TFailure extends OperationFailure>(
  value: void | ContractCheckFailure<TFailure>,
): ReadonlyArray<TFailure> => {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? (value as ReadonlyArray<TFailure>) : [value as TFailure];
};

const failIfContractFailed = <TFailure extends OperationFailure>(
  failures: ReadonlyArray<TFailure>,
): Effect.Effect<void, TFailure> => (failures.length > 0 ? Effect.fail(failures[0]) : Effect.void);

const runPreChecks = <TInput extends OperationInput, TFailure extends OperationFailure>(
  checks: ReadonlyArray<ContractPreCheck<TInput, TFailure>>,
  runtime: LayerConcernRuntime<TInput>,
): Effect.Effect<void, TFailure | unknown> =>
  Effect.forEach(
    checks,
    check =>
      toEffect(() => check(runtime.input, runtime)).pipe(
        Effect.flatMap(result => failIfContractFailed(normalizeContractFailures(result))),
      ),
    { concurrency: 1, discard: true },
  );

const runPostChecks = <TInput extends OperationInput, TResult, TFailure extends OperationFailure>(
  checks: ReadonlyArray<ContractPostCheck<TInput, TResult, TFailure>>,
  runtime: LayerConcernRuntime<TInput>,
  result: TResult,
): Effect.Effect<void, TFailure | unknown> =>
  Effect.forEach(
    checks,
    check =>
      toEffect(() => check(runtime.input, result, runtime)).pipe(
        Effect.flatMap(checkResult => failIfContractFailed(normalizeContractFailures(checkResult))),
      ),
    { concurrency: 1, discard: true },
  );

export const contract = <
  TInput extends OperationInput,
  TResult,
  TFailure extends OperationFailure = OperationFailure,
>(
  contracts: OperationContracts<TInput, TResult, TFailure>,
): LayerConcern<TInput, TFailure | unknown> => {
  const preChecks = toReadonlyArray(contracts.pre);
  const postChecks = toReadonlyArray(contracts.post);

  return {
    run: (runtime, next) =>
      Effect.gen(function* () {
        if (preChecks.length > 0) {
          yield* runPreChecks(preChecks, runtime);
        }

        const rawResult = yield* next;

        if (postChecks.length > 0) {
          const result = (
            isEffectSuccessPayload<TResult>(rawResult) ? rawResult.value : rawResult
          ) as TResult;
          yield* runPostChecks(postChecks, runtime, result);
        }

        return rawResult;
      }),
  };
};

export const toContractConcern = <
  TInput extends OperationInput,
  TResult,
  TFailure extends OperationFailure = OperationFailure,
>(
  contracts: OperationContracts<TInput, TResult, TFailure> | undefined,
): LayerConcern<TInput, TFailure | unknown> | undefined =>
  contracts ? contract(contracts) : undefined;

export const contractFromValidation = <
  TInput extends OperationInput,
  TIssue = unknown,
  TReason extends string = 'invalid_input',
>(
  validate: (input: unknown) => ValidationResult<TInput, TIssue>,
  options?: ContractFromValidationOptions<TInput, TIssue, TReason>,
): ContractPreCheck<TInput, OperationFailure<TReason>> => {
  const reason = options?.reason ?? ('invalid_input' as TReason);

  return input => {
    const result = validate(input);
    if (result.success) {
      return;
    }

    const message = options?.formatMessage?.(result.errors, input) ?? 'Input validation failed.';
    return createOperationFailure(reason, message);
  };
};

export const contractFromTypia = <
  TInput extends OperationInput,
  TReason extends string = 'invalid_input',
>(
  validate: (input: unknown) => IValidation<TInput>,
  options?: ContractFromTypiaOptions<TInput, TReason>,
): ContractPreCheck<TInput, OperationFailure<TReason>> =>
  contractFromValidation<TInput, IValidation.IError, TReason>(validate, options);

export const contractFromZod = <
  TInput extends OperationInput,
  TReason extends string = 'invalid_input',
>(
  schema: ZodType<TInput>,
  options?: ContractFromZodOptions<TInput, TReason>,
): ContractPreCheck<TInput, OperationFailure<TReason>> => {
  const reason = options?.reason ?? ('invalid_input' as TReason);

  return input => {
    const result = schema.safeParse(input);
    if (result.success) {
      return;
    }

    const message =
      options?.formatMessage?.(result.error.issues, input) ??
      result.error.issues[0]?.message ??
      'Input validation failed.';

    return createOperationFailure(reason, message);
  };
};

export const createTypiaValidationMessageFormatter = <TInput extends OperationInput>(
  fieldMessages: Partial<Record<TypiaValidationFieldName<TInput>, TypiaFieldMessageRule>>,
  options?: CreateTypiaValidationMessageFormatterOptions,
) => {
  const defaultMessage = options?.defaultMessage ?? 'Input validation failed.';
  const pathPrefix = options?.pathPrefix ?? '$input.';

  return (errors: ReadonlyArray<IValidation.IError>): string => {
    const firstError = errors[0];
    if (!firstError?.path.startsWith(pathPrefix)) {
      return defaultMessage;
    }

    const fieldName = firstError.path.slice(pathPrefix.length) as TypiaValidationFieldName<TInput>;
    const rule = fieldMessages[fieldName];
    if (!rule) {
      return defaultMessage;
    }

    if (typeof rule === 'string') {
      return rule;
    }

    const expectedMatch = Object.entries(rule.expectedIncludes ?? {}).find(([expected]) =>
      firstError.expected.includes(expected),
    );

    if (!expectedMatch) {
      return rule.default;
    }

    const [, message] = expectedMatch;
    return typeof message === 'function' ? message(firstError) : message;
  };
};
