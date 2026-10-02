import type {
  AnyGraphObjectDefinition,
  GraphSchemaDefinition,
  GraphSchemaParseResult,
  GraphSchemaValidationIssue,
  InferGraphSchemaClientInput,
} from '../data-graph/index.js';
import {
  normalizeGraphSchemaClientInput,
  safeParseUnknownGraphSchema,
  toGraphSchemaDescriptor,
} from '../data-graph/index.js';
import type { OperationInvokeRequest } from '../runtime/operation-invocation.js';

export type OperationApplicationHole = {
  readonly kind: 'hole';
  readonly id: string;
};

export type OperationApplicationValue = {
  readonly kind: 'value';
  readonly value: unknown;
};

export type OperationApplicationArgument = OperationApplicationHole | OperationApplicationValue;

export type OperationApplication = {
  readonly kind: 'operation-application';
  readonly operationId: string;
  readonly arguments: Readonly<Record<string, OperationApplicationArgument>>;
};

export type OperationApplicationContract<
  TInput extends AnyGraphObjectDefinition = AnyGraphObjectDefinition,
> = {
  readonly id: string;
  readonly input: TInput;
};

export type OperationApplicationDraft<TInput extends AnyGraphObjectDefinition> = Partial<{
  readonly [TName in keyof TInput['fields']]:
    | InferGraphSchemaClientInput<TInput['fields'][TName]>
    | OperationApplicationHole;
}>;

export type OperationApplicationLoweringResult =
  | { readonly success: true; readonly request: OperationInvokeRequest }
  | {
      readonly success: false;
      readonly reason: 'open-application';
      readonly holes: readonly string[];
    }
  | {
      readonly success: false;
      readonly reason: 'invalid-input';
      readonly issues: readonly GraphSchemaValidationIssue[];
    };

export type OperationApplicationSubstitutionResult =
  | { readonly success: true; readonly application: OperationApplication }
  | {
      readonly success: false;
      readonly reason: 'unknown-hole';
      readonly holeId: string;
    }
  | {
      readonly success: false;
      readonly reason: 'invalid-substitution';
      readonly holeId: string;
      readonly issues: readonly GraphSchemaValidationIssue[];
    };

export const operationApplicationHole = (id: string): OperationApplicationHole => {
  if (id.length === 0) throw new Error('Operation application Hole id must not be empty.');
  return { kind: 'hole', id };
};

const operationInputFields = (contract: OperationApplicationContract) => {
  if (contract.input.kind !== 'schema.object') {
    throw new Error(`Operation ${contract.id} must declare an object input schema.`);
  }
  return contract.input.fields;
};

const isHole = (value: unknown): value is OperationApplicationHole =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  value.kind === 'hole' &&
  'id' in value &&
  typeof value.id === 'string' &&
  value.id.length > 0;

const isRequiredInput = (schema: GraphSchemaDefinition) => {
  const descriptor = toGraphSchemaDescriptor(schema);
  return descriptor.kind !== 'optional' && descriptor.kind !== 'default';
};

const parseClientInput = (
  schema: GraphSchemaDefinition,
  value: unknown,
): GraphSchemaParseResult<unknown> => {
  try {
    return safeParseUnknownGraphSchema(schema, normalizeGraphSchemaClientInput(schema, value));
  } catch (error) {
    return {
      success: false,
      issues: [
        {
          code: 'invalid_operation_input',
          path: [],
          message:
            error instanceof Error ? error.message : 'Input does not match the Operation schema.',
        },
      ],
    };
  }
};

export const normalizeOperationApplication = <TInput extends AnyGraphObjectDefinition>(
  contract: OperationApplicationContract<TInput>,
  input: OperationApplicationDraft<TInput> = {},
): OperationApplication => {
  const fields = operationInputFields(contract);
  const argumentsByName: Record<string, OperationApplicationArgument> = {};

  for (const [name, schema] of Object.entries(fields)) {
    if (Object.prototype.hasOwnProperty.call(input, name)) {
      const value = input[name];
      argumentsByName[name] = isHole(value) ? value : { kind: 'value', value };
    } else if (isRequiredInput(schema as GraphSchemaDefinition)) {
      argumentsByName[name] = operationApplicationHole(name);
    }
  }

  for (const [name, value] of Object.entries(input)) {
    if (!(name in fields)) {
      argumentsByName[name] = isHole(value) ? value : { kind: 'value', value };
    }
  }

  return {
    kind: 'operation-application',
    operationId: contract.id,
    arguments: argumentsByName,
  };
};

export const operationApplicationHoles = (application: OperationApplication): readonly string[] => [
  ...new Set(
    Object.values(application.arguments)
      .filter((argument): argument is OperationApplicationHole => argument.kind === 'hole')
      .map(argument => argument.id),
  ),
];

export const substituteOperationApplication = (
  contract: OperationApplicationContract,
  application: OperationApplication,
  holeId: string,
  value: unknown,
): OperationApplicationSubstitutionResult => {
  if (application.operationId !== contract.id)
    return {
      success: false,
      reason: 'invalid-substitution',
      holeId,
      issues: [
        {
          code: 'operation_mismatch',
          path: [],
          message: `Operation application ${application.operationId} does not match ${contract.id}.`,
        },
      ],
    };
  const fields = operationInputFields(contract);
  const positions = Object.entries(application.arguments).filter(
    ([, argument]) => argument.kind === 'hole' && argument.id === holeId,
  );
  if (positions.length === 0) return { success: false, reason: 'unknown-hole', holeId };

  const parsedPositions = positions.map(([name]) => ({
    name,
    result: fields[name]
      ? parseClientInput(fields[name] as GraphSchemaDefinition, value)
      : {
          success: false as const,
          issues: [
            {
              code: 'unknown_operation_input',
              path: [],
              message: `Unknown Operation input ${name}.`,
            },
          ],
        },
  }));
  const issues = parsedPositions.flatMap(({ name, result }) =>
    result.success ? [] : result.issues.map(issue => ({ ...issue, path: [name, ...issue.path] })),
  );
  if (issues.length > 0) return { success: false, reason: 'invalid-substitution', holeId, issues };

  return {
    success: true,
    application: {
      ...application,
      arguments: Object.fromEntries(
        Object.entries(application.arguments).map(([name, argument]) => [
          name,
          argument.kind === 'hole' && argument.id === holeId ? { kind: 'value', value } : argument,
        ]),
      ),
    },
  };
};

export const lowerOperationApplication = (
  contract: OperationApplicationContract,
  application: OperationApplication,
): OperationApplicationLoweringResult => {
  if (application.operationId !== contract.id)
    return {
      success: false,
      reason: 'invalid-input',
      issues: [
        {
          code: 'operation_mismatch',
          path: [],
          message: `Operation application ${application.operationId} does not match ${contract.id}.`,
        },
      ],
    };
  const holes = operationApplicationHoles(application);
  if (holes.length > 0) return { success: false, reason: 'open-application', holes };

  const parsed = parseClientInput(
    contract.input,
    Object.fromEntries(
      Object.entries(application.arguments).map(([name, argument]) => [
        name,
        (argument as OperationApplicationValue).value,
      ]),
    ),
  );
  if (!parsed.success) return { success: false, reason: 'invalid-input', issues: parsed.issues };

  return {
    success: true,
    request: { kind: 'invoke', operationId: application.operationId, input: parsed.data },
  };
};
