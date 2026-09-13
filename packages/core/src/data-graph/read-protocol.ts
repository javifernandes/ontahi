import { cloneJson, isJsonValue } from '../value/json.js';
import { hasOwn, isRecord } from '../value/object.js';

import { graphSchema, type AnyEntityDefinition } from './definitions.js';
import {
  isEntityVariantDescriptor,
  type EntityVariantDescriptor,
} from './entity-variant-contract.js';
import type { QueryBuilder, QuerySpec } from './query.js';
import { isEntityRef } from './ref/index.js';
import { parseGraphSchema } from './schema.js';
import {
  assertNoRelationImage,
  toSelectionAst,
  type SelectionAst,
  type SelectionExpression,
} from './selection-ast.js';
import { withinSelectionBudget } from './selection-budget.js';
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
  /** Request advisory capabilities alongside an authorized result, without changing Query meaning. */
  readonly includeCapabilities?: boolean;
};

/** Relation membership requires an explicitly enabled v2 receiver. */
export type GraphReadRequestV2 = Omit<GraphReadRequestV1, 'version'> & { readonly version: 2 };
export type GraphReadRequest = GraphReadRequestV1 | GraphReadRequestV2;

/** Receiver policy at the time of the read; subsequent reads must still be authorized. */
export type GraphReadCapabilities = {
  readonly orderBy: readonly string[];
  /** Registered classified roots sharing this Entity's read policy and canonical identity. */
  readonly variants?: readonly EntityVariantDescriptor[];
  /** Outgoing membership hops, distinct from View/include permissions. Advisory only. */
  readonly relationSelections?: { readonly version: 2; readonly relations: readonly string[] };
};

/** Advisory Entity policy discovery. Does not select, count, or materialize data. */
export type GraphReadCapabilitiesRequestV1 = {
  readonly version: 1;
  readonly kind: 'graph-read-capabilities';
  readonly entityName: string;
};

export type GraphReadCapabilitiesResult = {
  readonly kind: 'graph-read-capabilities-result';
  readonly entityName: string;
  readonly capabilities: GraphReadCapabilities;
};

export type GraphReadFamilyRequest = GraphReadRequest | GraphReadCapabilitiesRequestV1;

export const parseGraphReadFamilyRequest = (
  value: unknown,
):
  | { readonly success: true; readonly request: GraphReadFamilyRequest }
  | { readonly success: false; readonly error: GraphReadProtocolError } => {
  if (!isRecord(value) || value.kind !== 'graph-read-capabilities')
    return parseGraphReadRequest(value);
  if (value.version !== 1)
    return {
      success: false,
      error: graphReadProtocolError(
        'unsupported_version',
        `Unsupported data graph read protocol version: ${String(value.version)}.`,
      ),
    };
  if (typeof value.entityName !== 'string' || value.entityName.trim() === '')
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_request',
        'Graph Read capabilities require an Entity name.',
      ),
    };
  return {
    success: true,
    request: { version: 1, kind: 'graph-read-capabilities', entityName: value.entityName },
  };
};

export const isGraphReadCapabilities = (value: unknown): value is GraphReadCapabilities =>
  isRecord(value) &&
  Array.isArray(value.orderBy) &&
  value.orderBy.every(field => typeof field === 'string') &&
  (value.variants === undefined ||
    (Array.isArray(value.variants) && value.variants.every(isEntityVariantDescriptor))) &&
  (value.relationSelections === undefined ||
    (isRecord(value.relationSelections) &&
      value.relationSelections.version === 2 &&
      Array.isArray(value.relationSelections.relations) &&
      value.relationSelections.relations.every(relation => typeof relation === 'string')));

export type GraphReadProtocolErrorCode =
  | 'invalid_request'
  | 'unsupported_version'
  | 'unknown_entity'
  | 'invalid_selection'
  | 'invalid_projection'
  | 'cardinality_mismatch'
  | 'access_denied'
  | 'execution_unavailable';

export type GraphReadProtocolError = {
  readonly kind: 'protocol-error';
  readonly error: {
    readonly code: GraphReadProtocolErrorCode;
    readonly message: string;
    readonly details?: {
      readonly reason: 'ordering_not_allowed';
      readonly entityName: string;
      readonly fieldName: string;
    };
  };
};

const graphReadProtocolErrorCodes = new Set<GraphReadProtocolErrorCode>([
  'invalid_request',
  'unsupported_version',
  'unknown_entity',
  'invalid_selection',
  'invalid_projection',
  'cardinality_mismatch',
  'access_denied',
  'execution_unavailable',
]);

export const isGraphReadProtocolError = (value: unknown): value is GraphReadProtocolError =>
  isRecord(value) &&
  value.kind === 'protocol-error' &&
  isRecord(value.error) &&
  typeof value.error.code === 'string' &&
  graphReadProtocolErrorCodes.has(value.error.code as GraphReadProtocolErrorCode) &&
  typeof value.error.message === 'string' &&
  (value.error.details === undefined ||
    (value.error.code === 'access_denied' &&
      isRecord(value.error.details) &&
      value.error.details.reason === 'ordering_not_allowed' &&
      typeof value.error.details.entityName === 'string' &&
      typeof value.error.details.fieldName === 'string'));

export type GraphReadRequestParseResult =
  | { readonly success: true; readonly request: GraphReadRequest }
  | { readonly success: false; readonly error: GraphReadProtocolError };

export type GraphReadRequestResolveResult =
  | {
      readonly success: true;
      readonly request: GraphReadRequest;
      readonly query: QuerySpec;
    }
  | { readonly success: false; readonly error: GraphReadProtocolError };

export const graphReadProtocolError = (
  code: GraphReadProtocolErrorCode,
  message: string,
  details?: GraphReadProtocolError['error']['details'],
): GraphReadProtocolError => ({
  kind: 'protocol-error',
  error: { code, message, ...(details ? { details } : {}) },
});

const assertJsonSafeSelection = (expression: SelectionExpression): void => {
  if (expression.kind === 'relation-image') {
    assertJsonSafeSelection(expression.source.expression);
    return;
  }
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
): GraphReadRequestV1 => serializeGraphReadRequest(query, mode, 1);

/** Use only after discovering relationSelections.version === 2 on the receiver. */
export const toGraphReadRequestV2 = (
  query: QueryBuilder<any, any> | QuerySpec,
  mode: GraphReadMode,
): GraphReadRequestV2 => serializeGraphReadRequest(query, mode, 2);

const serializeGraphReadRequest = <TVersion extends 1 | 2>(
  query: QueryBuilder<any, any> | QuerySpec,
  mode: GraphReadMode,
  version: TVersion,
): Omit<GraphReadRequestV1, 'version'> & { readonly version: TVersion } => {
  const spec = 'build' in query ? query.build() : query;
  if (!withinSelectionBudget(spec.selection))
    throw new Error('Graph Read Selection exceeds its depth or node budget.');
  if (version === 1) assertNoRelationImage(spec.selection, 'Graph read protocol v1');
  if (!spec.view && (spec.select || spec.includes)) {
    throw new Error('Data graph read transport currently requires a View for projected Queries.');
  }
  assertJsonSafeSelection(spec.selection);
  const request: Omit<GraphReadRequestV1, 'version'> & { readonly version: TVersion } = {
    version,
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
  };

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
  if (value.version !== 1 && value.version !== 2) {
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
  if (value.version === 2 && !withinSelectionBudget(value.selection.expression))
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_selection',
        'Graph Read Selection exceeds its depth or node budget.',
      ),
    };
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
  if (value.cardinality === 'one' && value.limit === 0) {
    return {
      success: false,
      error: graphReadProtocolError('invalid_request', 'Exact-one reads cannot use limit(0).'),
    };
  }
  if (value.view !== undefined && !isRecord(value.view)) {
    return {
      success: false,
      error: graphReadProtocolError('invalid_request', 'Data graph read View must be an object.'),
    };
  }
  if (value.includeCapabilities !== undefined && typeof value.includeCapabilities !== 'boolean') {
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_request',
        'Data graph read includeCapabilities must be a boolean.',
      ),
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
      version: value.version,
      kind: 'graph-read',
      mode: value.mode,
      selection: value.selection,
      ...(value.view === undefined ? {} : { view: value.view }),
      orderBy: value.orderBy,
      ...(value.limit === undefined ? {} : { limit: value.limit }),
      ...(value.cardinality === undefined ? {} : { cardinality: value.cardinality }),
      ...(value.includeCapabilities === undefined
        ? {}
        : { includeCapabilities: value.includeCapabilities }),
    }) as unknown as GraphReadRequest,
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
  if (value.kind === 'relation-image')
    return selectionError('Graph read protocol v1 does not yet support relation-image Selections.');
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
  request: GraphReadRequest,
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
  let expression = request.selection.expression;
  if (request.version === 2) {
    try {
      expression = parseGraphSchema(
        graphSchema.selection(entity, { entities: options.entities }),
        request.selection,
      ).expression;
    } catch {
      return {
        success: false,
        error: selectionError('Invalid contextual Selection for the receiver model.'),
      };
    }
  } else {
    const invalidSelection = validateGraphReadSelection(expression, entity);
    if (invalidSelection) return { success: false, error: invalidSelection };
  }
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
    selection: expression,
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
