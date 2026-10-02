import type {
  AnyEntityDefinition,
  GraphReadProtocolError,
  GraphReadRequest,
  GraphSchemaDefinition,
  GraphSchemaValidationIssue,
  SelectionExpression,
} from '../data-graph/index.js';
import {
  normalizeGraphSchemaClientInput,
  parseGraphReadRequest,
  resolveGraphReadRequest,
  safeParseUnknownGraphSchema,
} from '../data-graph/index.js';

import {
  operationApplicationHole,
  type OperationApplicationHole,
} from './operation-application.js';

type OpenGraphReadSelectionExpression = SelectionExpression;

export type GraphReadApplication = {
  readonly kind: 'graph-read-application';
  readonly request: Omit<GraphReadRequest, 'selection'> & {
    readonly selection: {
      readonly kind: 'selection';
      readonly entityName: string;
      readonly expression: OpenGraphReadSelectionExpression;
    };
  };
};

export type GraphReadApplicationSubstitutionResult =
  | { readonly success: true; readonly application: GraphReadApplication }
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

export type GraphReadApplicationLoweringResult =
  | { readonly success: true; readonly request: GraphReadRequest }
  | {
      readonly success: false;
      readonly reason: 'open-application';
      readonly holes: readonly string[];
    }
  | {
      readonly success: false;
      readonly reason: 'invalid-request';
      readonly error: GraphReadProtocolError;
    };

type PredicateValue = {
  readonly fieldName: string;
  readonly value: unknown;
};

const isHole = (value: unknown): value is OperationApplicationHole =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  value.kind === 'hole' &&
  'id' in value &&
  typeof value.id === 'string' &&
  value.id.length > 0;

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

const readEntity = (
  request: GraphReadRequest,
  entities: readonly AnyEntityDefinition[],
): AnyEntityDefinition | undefined =>
  entities.find(entity => entity.name === request.selection.entityName);

const parseFieldValue = (schema: GraphSchemaDefinition, value: unknown) => {
  try {
    return safeParseUnknownGraphSchema(schema, normalizeGraphSchemaClientInput(schema, value));
  } catch (error) {
    return {
      success: false as const,
      issues: [
        {
          code: 'invalid_graph_read_input',
          path: [],
          message: error instanceof Error ? error.message : 'Invalid Graph Read predicate value.',
        },
      ],
    };
  }
};

export const openGraphReadApplication = (
  request: GraphReadRequest,
  entities: readonly AnyEntityDefinition[],
  holesByField: Readonly<Record<string, string>>,
): GraphReadApplication => {
  const resolved = resolveGraphReadRequest(request, { entities });
  if (!resolved.success) throw new Error(resolved.error.error.message);

  const matched = new Set<string>();
  const expression = mapPredicateValues(request.selection.expression, predicate => {
    const holeId = holesByField[predicate.fieldName];
    if (holeId === undefined) return predicate.value;
    matched.add(predicate.fieldName);
    return operationApplicationHole(holeId);
  });
  const missing = Object.keys(holesByField).filter(fieldName => !matched.has(fieldName));
  if (missing.length > 0)
    throw new Error(`Graph Read application has no value predicate for ${missing.join(', ')}.`);

  return {
    kind: 'graph-read-application',
    request: {
      ...request,
      selection: { ...request.selection, expression },
    },
  };
};

export const graphReadApplicationHoles = (application: GraphReadApplication): readonly string[] => [
  ...new Set(
    predicateValues(application.request.selection.expression).flatMap(predicate =>
      isHole(predicate.value) ? [predicate.value.id] : [],
    ),
  ),
];

export const substituteGraphReadApplication = (
  application: GraphReadApplication,
  entities: readonly AnyEntityDefinition[],
  holeId: string,
  value: unknown,
): GraphReadApplicationSubstitutionResult => {
  const entity = readEntity(application.request as GraphReadRequest, entities);
  const positions = predicateValues(application.request.selection.expression).filter(
    predicate => isHole(predicate.value) && predicate.value.id === holeId,
  );
  if (positions.length === 0) return { success: false, reason: 'unknown-hole', holeId };

  const issues = positions.flatMap(position => {
    const schema = entity?.fields[position.fieldName];
    if (!schema)
      return [
        {
          code: 'unknown_graph_read_field',
          path: [position.fieldName],
          message: `Unknown Graph Read field ${position.fieldName}.`,
        },
      ];
    const parsed = parseFieldValue(schema as GraphSchemaDefinition, value);
    return parsed.success
      ? []
      : parsed.issues.map(issue => ({ ...issue, path: [position.fieldName, ...issue.path] }));
  });
  if (issues.length > 0) return { success: false, reason: 'invalid-substitution', holeId, issues };

  return {
    success: true,
    application: {
      ...application,
      request: {
        ...application.request,
        selection: {
          ...application.request.selection,
          expression: mapPredicateValues(application.request.selection.expression, predicate =>
            isHole(predicate.value) && predicate.value.id === holeId ? value : predicate.value,
          ),
        },
      },
    },
  };
};

export const lowerGraphReadApplication = (
  application: GraphReadApplication,
  entities: readonly AnyEntityDefinition[],
): GraphReadApplicationLoweringResult => {
  const holes = graphReadApplicationHoles(application);
  if (holes.length > 0) return { success: false, reason: 'open-application', holes };

  const parsed = parseGraphReadRequest(application.request);
  if (!parsed.success) return { success: false, reason: 'invalid-request', error: parsed.error };
  const resolved = resolveGraphReadRequest(parsed.request, { entities });
  return resolved.success
    ? { success: true, request: resolved.request }
    : { success: false, reason: 'invalid-request', error: resolved.error };
};
