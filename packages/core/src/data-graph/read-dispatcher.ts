import { Cause, Option, Runtime } from 'effect';

import { isJsonValue, type JsonValue } from '../value/json.js';
import { hasOwn, isRecord } from '../value/object.js';

import {
  isDerivedFieldDefinition,
  type AnyEntityDefinition,
  type RelationDefinition,
  type RelationKind,
} from './definitions.js';
import type { AnyEntityVariant, EntityVariantDescriptor } from './entity-variant-contract.js';
import type { QuerySpec } from './query.js';
import {
  graphReadProtocolError,
  parseGraphReadRequest,
  parseGraphReadFamilyRequest,
  type GraphReadCapabilitiesResult,
  resolveGraphReadRequest,
  validateGraphReadSelection,
  type GraphReadMode,
  type GraphReadCapabilities,
  type GraphReadProtocolError,
} from './read-protocol.js';
import {
  createReadVariantRegistry,
  lowerReadVariantSelection,
  readVariantCapabilities,
} from './read-variants.js';
import {
  selectionAnd,
  type EntitySelectionSource,
  type SelectionExpression,
  type SelectionPredicate,
} from './selection-ast.js';
import type { ViewNode } from './view.js';

export type GraphReadOperator = SelectionPredicate['operator'];
export type GraphReadCardinality = 'one' | 'many';

export type GraphReadFieldPolicy = {
  readonly select?: true;
  readonly filter?: readonly GraphReadOperator[];
  readonly order?: true;
};

type RelationTarget<TDefinition> =
  TDefinition extends RelationDefinition<RelationKind, infer TTarget extends AnyEntityDefinition>
    ? TTarget
    : never;

export type GraphReadPolicyNode<TEntity extends AnyEntityDefinition = AnyEntityDefinition> = {
  readonly fields: Partial<{
    readonly [TField in keyof TEntity['fields'] & string]: GraphReadFieldPolicy;
  }>;
  readonly relations?: Partial<{
    readonly [TRelation in keyof TEntity['relations'] & string]: GraphReadPolicyNode<
      RelationTarget<TEntity['relations'][TRelation]>
    >;
  }>;
};

export type GraphReadPolicyContext<TEntity extends AnyEntityDefinition, TAuthority> = {
  readonly authority: TAuthority;
  readonly entity: TEntity;
};

export type GraphReadPolicy<
  TEntity extends AnyEntityDefinition = AnyEntityDefinition,
  TAuthority = unknown,
> = GraphReadPolicyNode<TEntity> & {
  readonly entity: TEntity;
  /** Classified read roots inherit this policy; registration grants no additional Field permissions. */
  readonly variants?: readonly AnyEntityVariant[];
  readonly modes: readonly GraphReadMode[];
  readonly cardinalities: readonly GraphReadCardinality[];
  readonly maxLimit: number;
  /** Outgoing Selection membership hops. View/include grants never imply this permission. */
  readonly selectionRelations?: readonly (keyof TEntity['relations'] & string)[];
  readonly scope:
    | 'all'
    | ((
        context: GraphReadPolicyContext<TEntity, TAuthority>,
      ) => SelectionExpression | EntitySelectionSource<TEntity>);
};

export type GraphReadDispatchContext<TAuthority> = {
  readonly authority: TAuthority;
};

export type GraphReadDispatchResponse =
  | GraphReadCapabilitiesResult
  | {
      readonly kind: 'graph-read-result';
      readonly value: unknown;
      readonly capabilities?: GraphReadCapabilities;
    }
  | GraphReadProtocolError;

export type GraphReadObservationResponse =
  | {
      readonly kind: 'graph-read-result';
      readonly value: JsonValue[];
      readonly capabilities?: GraphReadCapabilities;
    }
  | GraphReadProtocolError;

export type GraphReadDispatchExecutor = (query: QuerySpec, mode: GraphReadMode) => Promise<unknown>;

export type GraphReadObservationExecutor = (
  query: QuerySpec,
  options: { readonly signal: AbortSignal },
) => AsyncIterable<unknown>;

export type GraphReadDispatcher<TAuthority> = (
  request: unknown,
  context: GraphReadDispatchContext<TAuthority>,
) => Promise<GraphReadDispatchResponse>;

export type GraphReadObserver<TAuthority> = (
  request: unknown,
  context: GraphReadDispatchContext<TAuthority> & { readonly signal: AbortSignal },
) => AsyncIterable<GraphReadObservationResponse>;

export type CreateGraphReadDispatcherOptions<TAuthority> = {
  readonly policies: readonly GraphReadPolicy<any, TAuthority>[];
  readonly execute: GraphReadDispatchExecutor;
  /** Enable v2 only when the executor supports deferred relation-image reads. */
  readonly relationSelections?: true;
  readonly reportError?: (error: unknown) => void;
};

export type CreateGraphReadObserverOptions<TAuthority> = {
  readonly policies: readonly GraphReadPolicy<any, TAuthority>[];
  readonly observe: GraphReadObservationExecutor;
  readonly reportError?: (error: unknown) => void;
};

const graphReadAccessDenied = () =>
  graphReadProtocolError('access_denied', 'Data graph read access denied.');

const graphReadExecutionUnavailable = () =>
  graphReadProtocolError(
    'execution_unavailable',
    'Data graph read execution is temporarily unavailable.',
  );

const cardinalityMismatchMarkers = new Set([
  'cardinality_mismatch',
  'selection_cardinality_mismatch',
]);

const isCardinalityMismatchMarker = (value: unknown) =>
  typeof value === 'string' && cardinalityMismatchMarkers.has(value);

const hasCardinalityMismatchMarker = (error: unknown) =>
  isRecord(error) &&
  (isCardinalityMismatchMarker(error.reason) ||
    isCardinalityMismatchMarker(error.cause) ||
    (isRecord(error.cause) &&
      (isCardinalityMismatchMarker(error.cause.reason) ||
        isCardinalityMismatchMarker(error.cause.cause))));

const isGraphReadCardinalityMismatch = (error: unknown) => {
  if (!Runtime.isFiberFailure(error)) return hasCardinalityMismatchMarker(error);
  const failure = Cause.failureOption(error[Runtime.FiberFailureCauseId]);
  return Option.isSome(failure) && hasCardinalityMismatchMarker(failure.value);
};

const graphReadCardinalityMismatch = (entityName: string) =>
  graphReadProtocolError(
    'cardinality_mismatch',
    `Expected exactly one ${entityName}, but the Selection resolved to zero or multiple results.`,
  );

const validOperators = new Set<GraphReadOperator>(['eq', 'in', 'isNull', 'lte', 'lt', 'gte', 'gt']);

const validatePolicyNode = (
  entity: AnyEntityDefinition,
  policy: GraphReadPolicyNode,
  path = entity.name,
): void => {
  for (const [fieldName, fieldPolicy] of Object.entries(policy.fields)) {
    if (!fieldPolicy) continue;
    if (!hasOwn(entity.fields, fieldName)) {
      throw new Error(`Unknown graph read policy field ${path}.${fieldName}.`);
    }
    for (const operator of fieldPolicy.filter ?? []) {
      if (!validOperators.has(operator)) {
        throw new Error(`Unknown graph read policy operator ${path}.${fieldName}.${operator}.`);
      }
    }
  }

  for (const [relationName, relationPolicy] of Object.entries(policy.relations ?? {})) {
    if (!relationPolicy) continue;
    if (!hasOwn(entity.relations, relationName)) {
      throw new Error(`Unknown graph read policy relation ${path}.${relationName}.`);
    }
    validatePolicyNode(
      entity.relations[relationName]!.target,
      relationPolicy,
      `${path}.${relationName}`,
    );
  }
};

const validatePolicy = (policy: GraphReadPolicy<any, any>): void => {
  for (const relation of policy.selectionRelations ?? []) {
    if (!hasOwn(policy.entity.relations, relation))
      throw new Error(`Unknown graph read Selection relation ${policy.entity.name}.${relation}.`);
  }
  if (!Number.isInteger(policy.maxLimit) || policy.maxLimit < 1) {
    throw new Error(`Graph read policy ${policy.entity.name} requires a positive maxLimit.`);
  }
  if (
    policy.modes.length === 0 ||
    policy.modes.some(mode => mode !== 'get' && mode !== 'run' && mode !== 'count')
  ) {
    throw new Error(`Graph read policy ${policy.entity.name} requires valid read modes.`);
  }
  if (
    policy.cardinalities.length === 0 ||
    policy.cardinalities.some(cardinality => cardinality !== 'one' && cardinality !== 'many')
  ) {
    throw new Error(`Graph read policy ${policy.entity.name} requires valid cardinalities.`);
  }
  if (policy.scope !== 'all' && typeof policy.scope !== 'function') {
    throw new Error(
      `Graph read policy ${policy.entity.name} requires an authority scope or explicit "all" scope.`,
    );
  }
  validatePolicyNode(policy.entity, policy);
};

const readFieldPolicy = (
  policy: GraphReadPolicyNode,
  fieldName: string,
): GraphReadFieldPolicy | undefined =>
  (policy.fields as Readonly<Record<string, GraphReadFieldPolicy | undefined>>)[fieldName];

const allowsDerivedFieldDependencies = (
  entity: AnyEntityDefinition,
  fieldName: string,
  policy: GraphReadPolicyNode,
) => {
  const field = entity.fields[fieldName];
  if (!field || !isDerivedFieldDefinition(field)) return true;

  return (field.derived.dependencies ?? []).every(dependency => {
    if (dependency.kind === 'field') {
      return readFieldPolicy(policy, dependency.field)?.select === true;
    }
    if (dependency.kind === 'relation-aggregate') {
      return Boolean(
        (
          policy.relations as Readonly<Record<string, GraphReadPolicyNode | undefined>> | undefined
        )?.[dependency.relation],
      );
    }
    return false;
  });
};

const allowsSelection = (
  expression: SelectionExpression,
  policy: GraphReadPolicyNode,
  entity: AnyEntityDefinition,
  allowsImage?: (
    image: Extract<SelectionExpression, { kind: 'relation-image' }>,
    target: AnyEntityDefinition,
  ) => boolean,
): boolean => {
  if (expression.kind === 'all' || expression.kind === 'none') return true;
  if (expression.kind === 'relation-image') return allowsImage?.(expression, entity) ?? false;
  if (expression.kind === 'references') {
    return expression.refs.every(ref =>
      Object.keys(ref.locator).every(fieldName =>
        readFieldPolicy(policy, fieldName)?.filter?.includes('eq'),
      ),
    );
  }
  if (expression.kind === 'and' || expression.kind === 'or') {
    return expression.operands.every(operand =>
      allowsSelection(operand, policy, entity, allowsImage),
    );
  }
  if (expression.kind === 'not')
    return allowsSelection(expression.operand, policy, entity, allowsImage);

  return Boolean(
    readFieldPolicy(policy, expression.fieldName)?.filter?.includes(expression.operator) &&
    allowsDerivedFieldDependencies(entity, expression.fieldName, policy),
  );
};

const allowsViewNode = (
  entity: AnyEntityDefinition,
  view: ViewNode,
  policy: GraphReadPolicyNode,
): boolean =>
  Object.entries(view.fields).every(([name, node]) => {
    if (node.kind === 'field-view') {
      if (readFieldPolicy(policy, name)?.select !== true) return false;
      return allowsDerivedFieldDependencies(entity, name, policy);
    }

    const relation = entity.relations[name];
    const relationPolicy = (
      policy.relations as Readonly<Record<string, GraphReadPolicyNode | undefined>> | undefined
    )?.[name];
    return Boolean(
      relation && relationPolicy && allowsViewNode(relation.target, node.view, relationPolicy),
    );
  });

const allowsProjection = (
  query: QuerySpec,
  policy: GraphReadPolicyNode,
  mode: GraphReadMode,
): boolean => {
  if (mode === 'count') return true;
  if (query.view) {
    return allowsViewNode(
      query.root,
      {
        kind: 'view-node',
        entity: query.view.entity,
        fields: query.view.fields,
      },
      policy,
    );
  }

  return allowsViewNode(
    query.root,
    {
      kind: 'view-node',
      entity: query.root.name,
      fields: Object.fromEntries(
        Object.keys(query.root.fields).map(fieldName => [
          fieldName,
          { kind: 'field-view', field: fieldName },
        ]),
      ),
    },
    policy,
  );
};

const allowsOrdering = (
  entity: AnyEntityDefinition,
  fieldName: string,
  policy: GraphReadPolicyNode,
): boolean =>
  readFieldPolicy(policy, fieldName)?.order === true &&
  allowsDerivedFieldDependencies(entity, fieldName, policy);

const queryAccessError = (
  query: QuerySpec,
  mode: GraphReadMode,
  policy: GraphReadPolicy<any, any>,
  allowsImage?: Parameters<typeof allowsSelection>[3],
): GraphReadProtocolError | undefined => {
  if (
    !policy.modes.includes(mode) ||
    (mode !== 'count' &&
      !policy.cardinalities.includes(query.cardinality ?? (mode === 'get' ? 'one' : 'many'))) ||
    (query.limit !== undefined && query.limit > policy.maxLimit) ||
    !allowsSelection(query.selection, policy, query.root, allowsImage) ||
    !allowsProjection(query, policy, mode)
  )
    return graphReadAccessDenied();

  const deniedOrder = query.orderBy.find(
    order => !allowsOrdering(query.root, order.fieldName, policy),
  );
  if (!deniedOrder) return undefined;
  return graphReadProtocolError(
    'access_denied',
    `Ordering by ${query.root.name}.${deniedOrder.fieldName} is not allowed by the Graph Read policy.`,
    {
      reason: 'ordering_not_allowed',
      entityName: query.root.name,
      fieldName: deniedOrder.fieldName,
    },
  );
};

const resolveScope = <TAuthority>(
  policy: GraphReadPolicy<any, TAuthority>,
  context: GraphReadDispatchContext<TAuthority>,
): SelectionExpression | undefined => {
  if (policy.scope === 'all') return undefined;
  const scoped = policy.scope({ authority: context.authority, entity: policy.entity });
  if ('expression' in scoped) {
    if (scoped.root !== policy.entity && scoped.root.name !== policy.entity.name) {
      throw new Error(
        `Graph read policy ${policy.entity.name} returned a ${scoped.root.name} Selection.`,
      );
    }
    return scoped.expression;
  }
  return scoped;
};

const createGraphReadPolicyRegistry = <TAuthority>(
  policies: readonly GraphReadPolicy<any, TAuthority>[],
) => {
  const policyByEntityName = new Map<string, GraphReadPolicy<any, TAuthority>>();
  for (const policy of policies) {
    if (policyByEntityName.has(policy.entity.name)) {
      throw new Error(`Duplicate graph read policy for Entity ${policy.entity.name}.`);
    }
    validatePolicy(policy);
    policyByEntityName.set(policy.entity.name, policy);
  }
  return policyByEntityName;
};

const relationSelectionCapabilities = <TAuthority>(
  policy: GraphReadPolicy<any, TAuthority>,
  policies: ReadonlyMap<string, GraphReadPolicy<any, TAuthority>>,
  enabled?: true,
): Pick<GraphReadCapabilities, 'relationSelections'> =>
  enabled
    ? {
        relationSelections: {
          version: 2,
          relations: (policy.selectionRelations ?? []).filter(name => {
            const target = policy.entity.relations[name]?.target;
            return target && policies.get(target.name)?.entity === target;
          }),
        },
      }
    : {};

/** Authorize caller membership first; mandatory scopes are added only after all grants pass. */
const createRelationSelectionAuthority = <TAuthority>(
  policies: ReadonlyMap<string, GraphReadPolicy<any, TAuthority>>,
  mode: GraphReadMode,
  context: GraphReadDispatchContext<TAuthority>,
) => {
  const allowsImage: NonNullable<Parameters<typeof allowsSelection>[3]> = (image, target) => {
    const source = policies.get(image.source.entityName);
    if (
      !source ||
      !source.modes.includes(mode) ||
      !source.selectionRelations?.includes(image.relationName) ||
      !hasOwn(source.entity.relations, image.relationName) ||
      source.entity.relations[image.relationName]!.target !== target
    )
      return false;
    return allowsSelection(image.source.expression, source, source.entity, allowsImage);
  };
  const scopes = new Map<string, SelectionExpression | undefined>();
  const scoped = (
    expression: SelectionExpression,
    policy: GraphReadPolicy<any, TAuthority>,
  ): SelectionExpression => {
    if (!scopes.has(policy.entity.name)) {
      const scope = resolveScope(policy, context);
      // Policy scopes remain receiver-owned scalar membership in this slice; avoid recursive
      // policy expansion and never place a mandatory scope inside the caller's NOT operand.
      const invalid = scope && validateGraphReadSelection(scope, policy.entity);
      if (invalid) throw new Error(invalid.error.message);
      scopes.set(policy.entity.name, scope);
    }
    const scope = scopes.get(policy.entity.name);
    const membership = visit(expression);
    return scope ? selectionAnd(membership, scope) : membership;
  };
  const visit = (expression: SelectionExpression): SelectionExpression => {
    if (expression.kind === 'relation-image')
      return {
        ...expression,
        source: {
          ...expression.source,
          expression: scoped(
            expression.source.expression,
            policies.get(expression.source.entityName)!,
          ),
        },
      };
    if (expression.kind === 'and' || expression.kind === 'or')
      return {
        ...expression,
        operands: expression.operands.map(visit),
      };
    if (expression.kind === 'not') return { ...expression, operand: visit(expression.operand) };
    return expression;
  };
  return { allowsImage, scoped };
};

type AuthorizedGraphRead =
  | {
      readonly success: true;
      readonly query: QuerySpec;
      readonly mode: GraphReadMode;
      readonly capabilities?: GraphReadCapabilities;
    }
  | { readonly success: false; readonly error: GraphReadProtocolError };

const withDefaultReadLimit = (query: QuerySpec, mode: GraphReadMode, maxLimit: number): QuerySpec =>
  mode !== 'count' && query.limit === undefined ? { ...query, limit: maxLimit } : query;

const authorizeGraphRead = <TAuthority>(
  input: unknown,
  context: GraphReadDispatchContext<TAuthority>,
  policyByEntityName: ReadonlyMap<string, GraphReadPolicy<any, TAuthority>>,
  reportError?: (error: unknown) => void,
  relationSelections?: true,
  variants: ReadonlyMap<string, EntityVariantDescriptor> = new Map(),
): AuthorizedGraphRead => {
  const parsed = parseGraphReadRequest(input);
  if (!parsed.success) return parsed;
  if (parsed.request.version === 2 && !relationSelections)
    return {
      success: false,
      error: graphReadProtocolError(
        'unsupported_version',
        'This receiver does not support Graph Read v2 relation Selections.',
      ),
    };

  const variant = variants.get(parsed.request.selection.entityName);
  const policy = policyByEntityName.get(
    variant?.baseEntityName ?? parsed.request.selection.entityName,
  );
  if (!policy) return { success: false, error: graphReadAccessDenied() };

  if (variant && parsed.request.view)
    return {
      success: false,
      error: graphReadProtocolError(
        'invalid_projection',
        'Variant-root Views are not supported yet.',
      ),
    };

  const resolved = resolveGraphReadRequest(
    {
      ...parsed.request,
      selection: lowerReadVariantSelection(parsed.request.selection, variants),
    },
    {
      entities: [...policyByEntityName.values()].map(entry => entry.entity),
    },
  );
  if (!resolved.success) return resolved;
  const membershipAuthority = createRelationSelectionAuthority(
    policyByEntityName,
    parsed.request.mode,
    context,
  );
  const accessError = queryAccessError(
    resolved.query,
    parsed.request.mode,
    policy,
    relationSelections ? membershipAuthority.allowsImage : undefined,
  );
  if (accessError) return { success: false, error: accessError };

  // Caller membership was checked without mandatory classifiers, which need no filter grant.
  const classified = resolveGraphReadRequest(
    {
      ...parsed.request,
      selection: lowerReadVariantSelection(parsed.request.selection, variants, true),
    },
    { entities: [...policyByEntityName.values()].map(entry => entry.entity) },
  );
  if (!classified.success) return classified;
  let query = classified.query;
  try {
    query = { ...query, selection: membershipAuthority.scoped(query.selection, policy) };
    query = withDefaultReadLimit(query, parsed.request.mode, policy.maxLimit);
  } catch (error) {
    reportError?.(error);
    return { success: false, error: graphReadExecutionUnavailable() };
  }

  return {
    success: true,
    query,
    mode: parsed.request.mode,
    ...(parsed.request.includeCapabilities
      ? {
          capabilities: {
            ...readVariantCapabilities(variants, policy.entity.name),
            ...relationSelectionCapabilities(policy, policyByEntityName, relationSelections),
            orderBy:
              parsed.request.mode === 'count'
                ? []
                : Object.keys(query.root.fields).filter(fieldName =>
                    allowsOrdering(query.root, fieldName, policy),
                  ),
          },
        }
      : {}),
  };
};

export const createGraphReadDispatcher = <TAuthority = unknown>({
  policies,
  execute,
  reportError,
  relationSelections,
}: CreateGraphReadDispatcherOptions<TAuthority>): GraphReadDispatcher<TAuthority> => {
  const policyByEntityName = createGraphReadPolicyRegistry(policies);
  const variants = createReadVariantRegistry(policies);

  return async (input, context) => {
    const parsed = parseGraphReadFamilyRequest(input);
    if (!parsed.success) return parsed.error;
    if (parsed.request.kind === 'graph-read-capabilities') {
      const variant = variants.get(parsed.request.entityName);
      const policy = policyByEntityName.get(variant?.baseEntityName ?? parsed.request.entityName);
      if (!policy) return graphReadAccessDenied();
      try {
        const scope = resolveScope(policy, context);
        const invalidScope = scope && validateGraphReadSelection(scope, policy.entity);
        if (invalidScope) throw new Error(invalidScope.error.message);
        return {
          kind: 'graph-read-capabilities-result',
          entityName: parsed.request.entityName,
          capabilities: {
            ...readVariantCapabilities(variants, policy.entity.name),
            ...relationSelectionCapabilities(policy, policyByEntityName, relationSelections),
            orderBy: policy.modes.some(mode => mode !== 'count')
              ? Object.keys(policy.entity.fields).filter(field =>
                  allowsOrdering(policy.entity, field, policy),
                )
              : [],
          },
        };
      } catch (error) {
        reportError?.(error);
        return graphReadExecutionUnavailable();
      }
    }
    const authorized = authorizeGraphRead(
      input,
      context,
      policyByEntityName,
      reportError,
      relationSelections,
      variants,
    );
    if (!authorized.success) return authorized.error;

    try {
      return {
        kind: 'graph-read-result',
        value: await execute(authorized.query, authorized.mode),
        ...(authorized.capabilities ? { capabilities: authorized.capabilities } : {}),
      };
    } catch (error) {
      const cardinality =
        authorized.query.cardinality ?? (authorized.mode === 'get' ? 'one' : 'many');
      if (cardinality === 'one' && isGraphReadCardinalityMismatch(error)) {
        return graphReadCardinalityMismatch(authorized.query.root.name);
      }
      reportError?.(error);
      return graphReadExecutionUnavailable();
    }
  };
};

export const createGraphReadObserver = <TAuthority = unknown>({
  policies,
  observe,
  reportError,
}: CreateGraphReadObserverOptions<TAuthority>): GraphReadObserver<TAuthority> => {
  const policyByEntityName = createGraphReadPolicyRegistry(policies);
  const variants = createReadVariantRegistry(policies);

  return (input, context) => {
    const authorized = authorizeGraphRead(
      input,
      context,
      policyByEntityName,
      reportError,
      undefined,
      variants,
    );

    return (async function* () {
      if (!authorized.success) {
        yield authorized.error;
        return;
      }
      if (authorized.mode !== 'run') {
        yield graphReadProtocolError(
          'invalid_request',
          'Data graph observation requires Graph Read mode run.',
        );
        return;
      }

      try {
        for await (const value of observe(authorized.query, { signal: context.signal })) {
          if (context.signal.aborted) return;
          if (!Array.isArray(value) || !isJsonValue(value)) {
            throw new Error('Data graph observer produced a non-JSON result array.');
          }
          yield {
            kind: 'graph-read-result',
            value,
            ...(authorized.capabilities ? { capabilities: authorized.capabilities } : {}),
          };
        }
      } catch (error) {
        if (context.signal.aborted) return;
        reportError?.(error);
        yield graphReadExecutionUnavailable();
      }
    })();
  };
};
