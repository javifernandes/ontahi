import { cloneJson, isJsonValue } from '../value/json.js';
import { hasOwn, isRecord } from '../value/object.js';

import type { AnyEntityDefinition } from './definitions.js';
import type { QueryBuilder, QuerySpec } from './query.js';
import { isEntityRef } from './ref/index.js';
import { toSelectionAst, type SelectionAst, type SelectionExpression } from './selection-ast.js';
import { applyViewToQuerySpec } from './view-query.js';
import { createRecursiveEntityViewFromAst, type EntityViewAst } from './view.js';

export type GraphReadMode = 'get' | 'run' | 'count';

export type GraphReadOrder = {
  readonly fieldName: string;
  readonly direction: 'asc' | 'desc';
};

export type GraphReadRequestV1 = {
  readonly version: 1;
  readonly kind: 'graph-read';
  readonly mode: GraphReadMode;
  readonly selection: SelectionAst;
  readonly view?: EntityViewAst;
  readonly orderBy: readonly GraphReadOrder[];
  readonly limit?: number;
  readonly cardinality?: 'one' | 'many';
};

export type GraphReadProtocolErrorCode =
  | 'invalid_request'
  | 'unsupported_version'
  | 'unknown_entity'
  | 'invalid_selection'
  | 'invalid_projection'
  | 'access_denied'
  | 'execution_unavailable';

export type GraphReadProtocolError = {
  readonly kind: 'protocol-error';
  readonly error: {
    readonly code: GraphReadProtocolErrorCode;
    readonly message: string;
  };
};

const graphReadProtocolErrorCodes = new Set<GraphReadProtocolErrorCode>([
  'invalid_request',
  'unsupported_version',
  'unknown_entity',
  'invalid_selection',
  'invalid_projection',
  'access_denied',
  'execution_unavailable',
]);

export const isGraphReadProtocolError = (value: unknown): value is GraphReadProtocolError =>
  isRecord(value) &&
  value.kind === 'protocol-error' &&
  isRecord(value.error) &&
  typeof value.error.code === 'string' &&
  graphReadProtocolErrorCodes.has(value.error.code as GraphReadProtocolErrorCode) &&
  typeof value.error.message === 'string';

export type GraphReadRequestParseResult =
  | { readonly success: true; readonly request: GraphReadRequestV1 }
  | { readonly success: false; readonly error: GraphReadProtocolError };

export type GraphReadRequestResolveResult =
  | {
      readonly success: true;
      readonly request: GraphReadRequestV1;
      readonly query: QuerySpec;
    }
  | { readonly success: false; readonly error: GraphReadProtocolError };

export const graphReadProtocolError = (
  code: GraphReadProtocolErrorCode,
  message: string,
): GraphReadProtocolError => ({
  kind: 'protocol-error',
  error: { code, message },
});

const assertJsonSafeSelection = (expression: SelectionExpression): void => {
  if (expression.kind === 'predicate') {
    const values =
      expression.operator === 'in'
        ? expression.values
        : expression.operator === 'isNull'
          ? []
          : [expression.value];
    if (!values.every(isJsonValue)) {
      throw new Error('Data graph read predicate value must be JSON-safe.');
    }
    return;
  }
  if (expression.kind === 'and' || expression.kind === 'or') {
    expression.operands.forEach(assertJsonSafeSelection);
    return;
  }
  if (expression.kind === 'not') {
    assertJsonSafeSelection(expression.operand);
    return;
  }
  if (expression.kind === 'references' && !isJsonValue(expression.refs)) {
    throw new Error('Data graph read reference must be JSON-safe.');
  }
};

export const toGraphReadRequest = (
  query: QueryBuilder<any, any> | QuerySpec,
  mode: GraphReadMode,
): GraphReadRequestV1 => {
  const spec = 'build' in query ? query.build() : query;
  if (!spec.view && (spec.select || spec.includes)) {
    throw new Error('Data graph read transport currently requires a View for projected Queries.');
  }
  assertJsonSafeSelection(spec.selection);
  const request = {
    version: 1,
    kind: 'graph-read',
    mode,
    selection: toSelectionAst(spec),
    ...(spec.view ? { view: spec.view } : {}),
    orderBy: spec.orderBy.map(order => ({
      fieldName: order.fieldName,
      direction: order.direction,
    })),
    ...(spec.limit === undefined ? {} : { limit: spec.limit }),
    ...(spec.cardinality === undefined ? {} : { cardinality: spec.cardinality }),
  } satisfies GraphReadRequestV1;

  if (!isJsonValue(request)) {
    throw new Error('Data graph read request must be JSON-safe.');
  }
  return cloneJson(request);
};

export const parseGraphReadRequest = (value: unknown): GraphReadRequestParseResult => {
  if (!isRecord(value)) {
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_request',
        'Data graph read request must be an object.',
      ),
    };
  }
  if (value.version !== 1) {
    return {
      success: false,
      error: graphReadProtocolError(
        'unsupported_version',
        `Unsupported data graph read protocol version: ${String(value.version)}.`,
      ),
    };
  }
  if (value.kind !== 'graph-read') {
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_request',
        'Data graph read request kind must be "graph-read".',
      ),
    };
  }
  if (!['get', 'run', 'count'].includes(value.mode as string)) {
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_request',
        'Data graph read mode must be "get", "run", or "count".',
      ),
    };
  }
  if (!isRecord(value.selection) || !Array.isArray(value.orderBy)) {
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_request',
        'Data graph read selection must be an object and orderBy must be an array.',
      ),
    };
  }
  const validOrder = value.orderBy.every(
    order =>
      isRecord(order) &&
      typeof order.fieldName === 'string' &&
      (order.direction === 'asc' || order.direction === 'desc'),
  );
  if (!validOrder) {
    return {
      success: false,
      error: graphReadProtocolError('invalid_request', 'Data graph read ordering is invalid.'),
    };
  }
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || Number(value.limit) < 0)) {
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_request',
        'Data graph read limit must be a non-negative integer.',
      ),
    };
  }
  if (
    value.cardinality !== undefined &&
    value.cardinality !== 'one' &&
    value.cardinality !== 'many'
  ) {
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_request',
        'Data graph read cardinality must be "one" or "many".',
      ),
    };
  }
  if (value.view !== undefined && !isRecord(value.view)) {
    return {
      success: false,
      error: graphReadProtocolError('invalid_request', 'Data graph read View must be an object.'),
    };
  }
  if (!isJsonValue(value)) {
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_request',
        'Data graph read request must be JSON-safe.',
      ),
    };
  }

  return {
    success: true,
    request: cloneJson({
      version: 1,
      kind: 'graph-read',
      mode: value.mode,
      selection: value.selection,
      ...(value.view === undefined ? {} : { view: value.view }),
      orderBy: value.orderBy,
      ...(value.limit === undefined ? {} : { limit: value.limit }),
      ...(value.cardinality === undefined ? {} : { cardinality: value.cardinality }),
    }) as unknown as GraphReadRequestV1,
  };
};

const selectionError = (message: string): GraphReadProtocolError =>
  graphReadProtocolError('invalid_selection', message);

export const validateGraphReadSelection = (
  value: unknown,
  entity: AnyEntityDefinition,
  depth = 0,
): GraphReadProtocolError | undefined => {
  if (!isRecord(value) || depth > 32) {
    return selectionError('Data graph read Selection is invalid or too deep.');
  }
  if (value.kind === 'all' || value.kind === 'none') return undefined;
  if (value.kind === 'references') {
    if (!Array.isArray(value.refs) || value.refs.some(ref => !isEntityRef(ref))) {
      return selectionError('Data graph read Selection references are invalid.');
    }
    if (value.refs.some(ref => ref.entityName !== entity.name)) {
      return selectionError(`Data graph read Selection references must target ${entity.name}.`);
    }
    const unknownLocatorField = value.refs
      .flatMap(ref => Object.keys(ref.locator))
      .find(fieldName => !hasOwn(entity.fields, fieldName));
    if (unknownLocatorField) {
      return selectionError(
        `Unknown Selection reference field ${entity.name}.${unknownLocatorField}.`,
      );
    }
    return undefined;
  }
  if (value.kind === 'and' || value.kind === 'or') {
    if (!Array.isArray(value.operands) || value.operands.length > 256) {
      return selectionError('Data graph read Selection operands are invalid or exceed 256 items.');
    }
    for (const operand of value.operands) {
      const error = validateGraphReadSelection(operand, entity, depth + 1);
      if (error) return error;
    }
    return undefined;
  }
  if (value.kind === 'not') {
    return validateGraphReadSelection(value.operand, entity, depth + 1);
  }
  if (value.kind !== 'predicate') {
    return selectionError(`Unknown data graph Selection kind: ${String(value.kind)}.`);
  }
  if (typeof value.fieldName !== 'string' || !hasOwn(entity.fields, value.fieldName)) {
    return selectionError(`Unknown Selection field ${entity.name}.${String(value.fieldName)}.`);
  }
  const operators = ['eq', 'in', 'isNull', 'lte', 'lt', 'gte', 'gt'];
  if (!operators.includes(value.operator as string)) {
    return selectionError(`Unknown data graph Selection operator: ${String(value.operator)}.`);
  }
  if (value.operator === 'in') {
    if (!Array.isArray(value.values) || !value.values.every(isJsonValue)) {
      return selectionError('Data graph read Selection values must be JSON-safe.');
    }
  } else if (
    value.operator !== 'isNull' &&
    (!hasOwn(value, 'value') || !isJsonValue(value.value))
  ) {
    return selectionError('Data graph read Selection value must be JSON-safe.');
  }
  return undefined;
};

export const resolveGraphReadRequest = (
  request: GraphReadRequestV1,
  options: { readonly entities: readonly AnyEntityDefinition[] },
): GraphReadRequestResolveResult => {
  if (
    request.selection.kind !== 'selection' ||
    typeof request.selection.entityName !== 'string' ||
    request.selection.entityName.length === 0 ||
    !isRecord(request.selection.expression)
  ) {
    return {
      success: false,
      error: selectionError('Data graph read Selection AST is invalid.'),
    };
  }
  const entity = options.entities.find(
    candidate => candidate.name === request.selection.entityName,
  );
  if (!entity) {
    return {
      success: false,
      error: graphReadProtocolError(
        'unknown_entity',
        `Unknown data graph Entity: ${request.selection.entityName}.`,
      ),
    };
  }
  const invalidSelection = validateGraphReadSelection(request.selection.expression, entity);
  if (invalidSelection) return { success: false, error: invalidSelection };
  for (const order of request.orderBy) {
    if (!hasOwn(entity.fields, order.fieldName)) {
      return {
        success: false,
        error: selectionError(`Unknown ordering field ${entity.name}.${order.fieldName}.`),
      };
    }
  }

  const base: QuerySpec = {
    kind: 'query',
    root: entity,
    selection: request.selection.expression,
    orderBy: request.orderBy.map(order => ({ ...order, kind: 'order' as const })),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
    ...(request.cardinality === undefined ? {} : { cardinality: request.cardinality }),
  };
  if (!request.view) return { success: true, request, query: base };

  try {
    const view = createRecursiveEntityViewFromAst(entity, request.view);
    return {
      success: true,
      request,
      query: applyViewToQuerySpec(base, view),
    };
  } catch (error) {
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_projection',
        error instanceof Error ? error.message : 'Data graph read View is invalid.',
      ),
    };
  }
};
