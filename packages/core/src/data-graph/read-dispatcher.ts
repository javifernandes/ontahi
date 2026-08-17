import { hasOwn } from '../value/object.js';

import type { AnyEntityDefinition, RelationDefinition, RelationKind } from './definitions.js';
import type { QuerySpec } from './query.js';
import {
  graphReadProtocolError,
  parseGraphReadRequest,
  resolveGraphReadRequest,
  validateGraphReadSelection,
  type GraphReadMode,
  type GraphReadProtocolError,
} from './read-protocol.js';
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
  readonly modes: readonly GraphReadMode[];
  readonly cardinalities: readonly GraphReadCardinality[];
  readonly maxLimit: number;
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
  | { readonly kind: 'graph-read-result'; readonly value: unknown }
  | GraphReadProtocolError;

export type GraphReadDispatchExecutor = (query: QuerySpec, mode: GraphReadMode) => Promise<unknown>;

export type GraphReadDispatcher<TAuthority> = (
  request: unknown,
  context: GraphReadDispatchContext<TAuthority>,
) => Promise<GraphReadDispatchResponse>;

export type CreateGraphReadDispatcherOptions<TAuthority> = {
  readonly policies: readonly GraphReadPolicy<any, TAuthority>[];
  readonly execute: GraphReadDispatchExecutor;
  readonly reportError?: (error: unknown) => void;
};

const graphReadAccessDenied = () =>
  graphReadProtocolError('access_denied', 'Data graph read access denied.');

const graphReadExecutionUnavailable = () =>
  graphReadProtocolError(
    'execution_unavailable',
    'Data graph read execution is temporarily unavailable.',
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

const allowsSelection = (expression: SelectionExpression, policy: GraphReadPolicyNode): boolean => {
  if (expression.kind === 'all' || expression.kind === 'none') return true;
  if (expression.kind === 'references') {
    return expression.refs.every(ref =>
      Object.keys(ref.locator).every(fieldName =>
        readFieldPolicy(policy, fieldName)?.filter?.includes('eq'),
      ),
    );
  }
  if (expression.kind === 'and' || expression.kind === 'or') {
    return expression.operands.every(operand => allowsSelection(operand, policy));
  }
  if (expression.kind === 'not') return allowsSelection(expression.operand, policy);

  return Boolean(
    readFieldPolicy(policy, expression.fieldName)?.filter?.includes(expression.operator),
  );
};

const allowsViewNode = (
  entity: AnyEntityDefinition,
  view: ViewNode,
  policy: GraphReadPolicyNode,
): boolean =>
  Object.entries(view.fields).every(([name, node]) => {
    if (node.kind === 'field-view') {
      return readFieldPolicy(policy, name)?.select === true;
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

  return Object.keys(query.root.fields).every(
    fieldName => readFieldPolicy(policy, fieldName)?.select === true,
  );
};

const allowsQuery = (
  query: QuerySpec,
  mode: GraphReadMode,
  policy: GraphReadPolicy<any, any>,
): boolean =>
  policy.modes.includes(mode) &&
  (mode === 'count' ||
    policy.cardinalities.includes(query.cardinality ?? (mode === 'get' ? 'one' : 'many'))) &&
  (query.limit === undefined || query.limit <= policy.maxLimit) &&
  allowsSelection(query.selection, policy) &&
  query.orderBy.every(order => readFieldPolicy(policy, order.fieldName)?.order === true) &&
  allowsProjection(query, policy, mode);

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

export const createGraphReadDispatcher = <TAuthority = unknown>({
  policies,
  execute,
  reportError,
}: CreateGraphReadDispatcherOptions<TAuthority>): GraphReadDispatcher<TAuthority> => {
  const policyByEntityName = new Map<string, GraphReadPolicy<any, TAuthority>>();
  for (const policy of policies) {
    if (policyByEntityName.has(policy.entity.name)) {
      throw new Error(`Duplicate graph read policy for Entity ${policy.entity.name}.`);
    }
    validatePolicy(policy);
    policyByEntityName.set(policy.entity.name, policy);
  }

  return async (input, context) => {
    const parsed = parseGraphReadRequest(input);
    if (!parsed.success) return parsed.error;

    const policy = policyByEntityName.get(parsed.request.selection.entityName);
    if (!policy) return graphReadAccessDenied();

    const resolved = resolveGraphReadRequest(parsed.request, { entities: [policy.entity] });
    if (!resolved.success) return resolved.error;
    if (!allowsQuery(resolved.query, parsed.request.mode, policy)) {
      return graphReadAccessDenied();
    }

    let query = resolved.query;
    try {
      const scope = resolveScope(policy, context);
      if (scope) {
        const invalidScope = validateGraphReadSelection(scope, policy.entity);
        if (invalidScope) throw new Error(invalidScope.error.message);
        query = { ...query, selection: selectionAnd(query.selection, scope) };
      }
      if (parsed.request.mode !== 'count' && query.limit === undefined) {
        query = { ...query, limit: policy.maxLimit };
      }
    } catch (error) {
      reportError?.(error);
      return graphReadExecutionUnavailable();
    }

    try {
      return {
        kind: 'graph-read-result',
        value: await execute(query, parsed.request.mode),
      };
    } catch (error) {
      reportError?.(error);
      return graphReadExecutionUnavailable();
    }
  };
};
