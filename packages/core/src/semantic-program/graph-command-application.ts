import type {
  AnyEntityDefinition,
  GraphCommandProtocolError,
  GraphCommandRequest,
  GraphSchemaDefinition,
  GraphSchemaValidationIssue,
  SelectionExpression,
} from '../data-graph/index.js';
import {
  normalizeGraphSchemaClientInput,
  parseGraphCommandRequest,
  resolveGraphCommandRequest,
  safeParseUnknownGraphSchema,
} from '../data-graph/index.js';

import { applicationHole, isApplicationHole } from './application-hole.js';

export type GraphCommandApplication = {
  readonly kind: 'graph-command-application';
  readonly request: GraphCommandRequest;
};

export type GraphCommandApplicationHolePosition = {
  readonly holeId: string;
  readonly entityName: string;
  readonly fieldName: string;
  readonly source: 'selection' | 'value';
};

export type GraphCommandApplicationSubstitutionResult =
  | { readonly success: true; readonly application: GraphCommandApplication }
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

export type GraphCommandApplicationLoweringResult =
  | { readonly success: true; readonly request: GraphCommandRequest }
  | {
      readonly success: false;
      readonly reason: 'open-application';
      readonly holes: readonly string[];
    }
  | {
      readonly success: false;
      readonly reason: 'invalid-request';
      readonly error: GraphCommandProtocolError;
    };

export const graphCommandApplication = (request: GraphCommandRequest): GraphCommandApplication => ({
  kind: 'graph-command-application',
  request,
});

type PredicateValue = {
  readonly fieldName: string;
  readonly value: unknown;
};

type PredicateHoleValue = PredicateValue & {
  readonly value: { readonly kind: 'hole'; readonly id: string };
};

const mapPredicateValues = (
  expression: SelectionExpression,
  map: (predicate: PredicateValue) => unknown,
): SelectionExpression => {
  if (expression.kind === 'predicate' && expression.operator !== 'isNull') {
    if (expression.operator === 'in') return expression;
    return { ...expression, value: map(expression) };
  }
  if (expression.kind === 'and' || expression.kind === 'or')
    return {
      ...expression,
      operands: expression.operands.map(operand => mapPredicateValues(operand, map)),
    };
  if (expression.kind === 'not')
    return { ...expression, operand: mapPredicateValues(expression.operand, map) };
  return expression;
};

const predicateValues = (expression: SelectionExpression): readonly PredicateValue[] => {
  const values: PredicateValue[] = [];
  mapPredicateValues(expression, predicate => {
    values.push(predicate);
    return predicate.value;
  });
  return values;
};

const selectionTarget = (application: GraphCommandApplication) => {
  const { command } = application.request;
  return command.kind === 'entity-mutation-command' &&
    command.action !== 'create' &&
    command.target.kind === 'selection'
    ? command.target
    : undefined;
};

const valueHoleEntries = (application: GraphCommandApplication) => {
  const { command } = application.request;
  if (command.kind !== 'entity-mutation-command' || command.action === 'delete') return [];
  return Object.entries(command.values).filter(
    (entry): entry is [string, { kind: 'hole'; id: string }] => isApplicationHole(entry[1]),
  );
};

const selectionHoleEntries = (application: GraphCommandApplication) => {
  const target = selectionTarget(application);
  return target
    ? predicateValues(target.expression).filter((entry): entry is PredicateHoleValue =>
        isApplicationHole(entry.value),
      )
    : [];
};

const readEntity = (
  entityName: string,
  entities: readonly AnyEntityDefinition[],
): AnyEntityDefinition | undefined => entities.find(entity => entity.name === entityName);

const parseFieldValue = (schema: GraphSchemaDefinition, value: unknown) => {
  try {
    return safeParseUnknownGraphSchema(schema, normalizeGraphSchemaClientInput(schema, value));
  } catch (error) {
    return {
      success: false as const,
      issues: [
        {
          code: 'invalid_graph_command_input',
          path: [],
          message: error instanceof Error ? error.message : 'Invalid Graph Command value.',
        },
      ],
    };
  }
};

export const openGraphCommandApplication = (
  request: GraphCommandRequest,
  entities: readonly AnyEntityDefinition[],
  holesByValueField: Readonly<Record<string, string>> = {},
  holesBySelectionField: Readonly<Record<string, string>> = {},
): GraphCommandApplication => {
  const resolved = resolveGraphCommandRequest(request, { entities });
  if (!resolved.success) throw new Error(resolved.error.error.message);
  const { command } = request;
  if (command.kind !== 'entity-mutation-command') {
    throw new Error('Graph Command application requires an Entity Mutation Command.');
  }

  const missing = Object.keys(holesByValueField).filter(fieldName =>
    command.action === 'delete'
      ? true
      : !Object.prototype.hasOwnProperty.call(command.values, fieldName),
  );
  if (missing.length > 0)
    throw new Error(`Graph Command application has no value field for ${missing.join(', ')}.`);

  const target = command.action === 'create' ? undefined : command.target;
  const matchedSelectionFields = new Set<string>();
  const openTarget =
    target?.kind === 'selection'
      ? {
          ...target,
          expression: mapPredicateValues(target.expression, predicate => {
            const holeId = holesBySelectionField[predicate.fieldName];
            if (holeId === undefined) return predicate.value;
            matchedSelectionFields.add(predicate.fieldName);
            return applicationHole(holeId);
          }),
        }
      : target;
  const missingSelectionFields = Object.keys(holesBySelectionField).filter(
    fieldName => !matchedSelectionFields.has(fieldName),
  );
  if (missingSelectionFields.length > 0)
    throw new Error(
      `Graph Command application has no Selection predicate for ${missingSelectionFields.join(', ')}.`,
    );

  return {
    kind: 'graph-command-application',
    request: {
      ...request,
      command: {
        ...command,
        ...(openTarget === undefined ? {} : { target: openTarget }),
        ...(command.action === 'delete'
          ? {}
          : {
              values: Object.fromEntries(
                Object.entries(command.values).map(([fieldName, value]) => [
                  fieldName,
                  holesByValueField[fieldName] === undefined
                    ? value
                    : applicationHole(holesByValueField[fieldName]),
                ]),
              ),
            }),
      },
    } as GraphCommandRequest,
  };
};

export const graphCommandApplicationHoles = (
  application: GraphCommandApplication,
): readonly string[] => [
  ...new Set([
    ...selectionHoleEntries(application).map(entry => entry.value.id),
    ...valueHoleEntries(application).map(([, hole]) => hole.id),
  ]),
];

export const graphCommandApplicationHolePositions = (
  application: GraphCommandApplication,
): readonly GraphCommandApplicationHolePosition[] => {
  const command = application.request.command;
  if (command.kind !== 'entity-mutation-command') return [];
  return [
    ...selectionHoleEntries(application).map(position => ({
      holeId: position.value.id,
      entityName: command.entityName,
      fieldName: position.fieldName,
      source: 'selection' as const,
    })),
    ...valueHoleEntries(application).map(([fieldName, hole]) => ({
      holeId: hole.id,
      entityName: command.entityName,
      fieldName,
      source: 'value' as const,
    })),
  ];
};

export const substituteGraphCommandApplication = (
  application: GraphCommandApplication,
  entities: readonly AnyEntityDefinition[],
  holeId: string,
  value: unknown,
): GraphCommandApplicationSubstitutionResult => {
  const command = application.request.command;
  if (command.kind !== 'entity-mutation-command') {
    return { success: false, reason: 'unknown-hole', holeId };
  }
  const positions = graphCommandApplicationHolePositions(application).filter(
    position => position.holeId === holeId,
  );
  if (positions.length === 0) return { success: false, reason: 'unknown-hole', holeId };

  const entity = readEntity(command.entityName, entities);
  const normalizedValues = new Map<string, unknown>();
  const issues = positions.flatMap(({ fieldName }) => {
    const schema = entity?.fields[fieldName];
    if (!schema)
      return [
        {
          code: 'unknown_graph_command_field',
          path: [fieldName],
          message: `Unknown Graph Command field ${fieldName}.`,
        },
      ];
    const parsed = parseFieldValue(schema as GraphSchemaDefinition, value);
    if (parsed.success) {
      normalizedValues.set(fieldName, parsed.data);
      return [];
    }
    return parsed.issues.map(issue => ({ ...issue, path: [fieldName, ...issue.path] }));
  });
  if (issues.length > 0) return { success: false, reason: 'invalid-substitution', holeId, issues };

  return {
    success: true,
    application: {
      ...application,
      request: {
        ...application.request,
        command: {
          ...command,
          ...(command.action === 'create' || command.target.kind !== 'selection'
            ? {}
            : {
                target: {
                  ...command.target,
                  expression: mapPredicateValues(command.target.expression, predicate =>
                    isApplicationHole(predicate.value) && predicate.value.id === holeId
                      ? normalizedValues.get(predicate.fieldName)
                      : predicate.value,
                  ),
                },
              }),
          ...(command.action === 'delete'
            ? {}
            : {
                values: Object.fromEntries(
                  Object.entries(command.values).map(([fieldName, current]) => [
                    fieldName,
                    isApplicationHole(current) && current.id === holeId
                      ? normalizedValues.get(fieldName)
                      : current,
                  ]),
                ),
              }),
        },
      } as GraphCommandRequest,
    },
  };
};

export const lowerGraphCommandApplication = (
  application: GraphCommandApplication,
  entities: readonly AnyEntityDefinition[],
): GraphCommandApplicationLoweringResult => {
  const holes = graphCommandApplicationHoles(application);
  if (holes.length > 0) return { success: false, reason: 'open-application', holes };

  const parsed = parseGraphCommandRequest(application.request);
  if (!parsed.success) return { success: false, reason: 'invalid-request', error: parsed.error };
  const resolved = resolveGraphCommandRequest(parsed.request, { entities });
  return resolved.success
    ? { success: true, request: resolved.request }
    : { success: false, reason: 'invalid-request', error: resolved.error };
};
