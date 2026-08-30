import { cloneJson, isJsonValue } from '../value/json.js';
import { hasOwn, isRecord } from '../value/object.js';

import {
  graphCommandProtocolError,
  parseGraphCommandRequest,
  resolveGraphCommandRequest,
  type GraphCommandProtocolError,
} from './command-protocol.js';
import {
  isDerivedFieldDefinition,
  isReferenceFieldDefinition,
  type AnyEntityDefinition,
  type StoredFieldName,
} from './definitions.js';
import {
  entityMutationCommandDiagnosticFromError,
  isEntityMutationCommandDiagnostic,
  isExactEntityMutationDelta,
  type EntityMutationCommand,
  type EntityMutationCommandDiagnostic,
  type EntityMutationDelta,
} from './entity-mutation-command.js';
import {
  isRelationshipCommandDiagnostic,
  isRelationshipCommandResult,
  relationshipCommandDiagnosticFromError,
  type RelationshipCommandDiagnostic,
  type RelationshipCommandResult,
} from './relationship-command-result.js';
import type { ManyToManyRelationshipCommand, RelationshipCommand } from './relationship-command.js';

export type RelationshipCommandPolicy<TEntity extends AnyEntityDefinition = AnyEntityDefinition> = {
  readonly entity: TEntity;
  readonly fieldName: keyof TEntity['fields'] & string;
  readonly actions: readonly RelationshipCommand['action'][];
};

export type ManyToManyRelationshipCommandPolicy<
  TEntity extends AnyEntityDefinition = AnyEntityDefinition,
> = {
  readonly entity: TEntity;
  readonly relationName: keyof TEntity['relations'] & string;
  readonly actions: readonly ManyToManyRelationshipCommand['action'][];
};

type EntityMutationPolicyFields<TEntity extends AnyEntityDefinition> = readonly (StoredFieldName<
  TEntity['fields']
> &
  string)[];

export type EntityMutationCommandPolicy<TEntity extends AnyEntityDefinition = AnyEntityDefinition> =
  {
    readonly entity: TEntity;
    readonly scope: 'all';
    readonly actions: {
      readonly create?: {
        readonly fields: EntityMutationPolicyFields<TEntity>;
        readonly result: EntityMutationPolicyFields<TEntity>;
      };
      readonly update?: {
        readonly fields: EntityMutationPolicyFields<TEntity>;
        readonly if?: EntityMutationPolicyFields<TEntity>;
        readonly result: EntityMutationPolicyFields<TEntity>;
      };
      readonly delete?: {
        readonly if?: EntityMutationPolicyFields<TEntity>;
        readonly result: EntityMutationPolicyFields<TEntity>;
      };
    };
  };

type AnyEntityMutationCommandPolicy = EntityMutationCommandPolicy<any>;
type AnyGraphCommandPolicy =
  | RelationshipCommandPolicy
  | ManyToManyRelationshipCommandPolicy
  | AnyEntityMutationCommandPolicy;

export type GraphCommandDispatchContext<TAuthority> = {
  readonly authority: TAuthority;
};

export type GraphCommandDispatchResponse =
  | {
      readonly kind: 'graph-command-result';
      readonly value: RelationshipCommandResult | EntityMutationDelta;
    }
  | {
      readonly kind: 'graph-command-rejection';
      readonly diagnostic: RelationshipCommandDiagnostic | EntityMutationCommandDiagnostic;
    }
  | GraphCommandProtocolError;

export type GraphCommandDispatchExecutor<TAuthority> = (
  command: RelationshipCommand,
  context: GraphCommandDispatchContext<TAuthority>,
) => Promise<RelationshipCommandResult>;

export type ManyToManyGraphCommandDispatchExecutor<TAuthority> = (
  command: ManyToManyRelationshipCommand,
  context: GraphCommandDispatchContext<TAuthority>,
) => Promise<RelationshipCommandResult>;

export type EntityMutationGraphCommandDispatchExecutor<TAuthority> = (
  command: EntityMutationCommand,
  context: GraphCommandDispatchContext<TAuthority>,
) => Promise<EntityMutationDelta>;

export type CreateGraphCommandDispatcherOptions<TAuthority> = {
  readonly policies: readonly (
    | RelationshipCommandPolicy
    | ManyToManyRelationshipCommandPolicy
    | EntityMutationCommandPolicy<any>
  )[];
  readonly execute?: GraphCommandDispatchExecutor<TAuthority>;
  readonly executeManyToMany?: ManyToManyGraphCommandDispatchExecutor<TAuthority>;
  readonly executeEntityMutation?: EntityMutationGraphCommandDispatchExecutor<TAuthority>;
  readonly reportError?: (error: unknown) => void;
};

export const isGraphCommandRejection = (
  value: unknown,
): value is Extract<GraphCommandDispatchResponse, { kind: 'graph-command-rejection' }> =>
  isRecord(value) &&
  value.kind === 'graph-command-rejection' &&
  (isRelationshipCommandDiagnostic(value.diagnostic) ||
    isEntityMutationCommandDiagnostic(value.diagnostic));

const policyKey = (entityName: string, fieldName: string, targetEntityName: string) =>
  `${entityName}\u0000${fieldName}\u0000${targetEntityName}`;

const validatePolicy = (policy: RelationshipCommandPolicy) => {
  const field = policy.entity.fields[policy.fieldName];
  if (!field || !isReferenceFieldDefinition(field)) {
    throw new Error(
      `Graph Command policy ${policy.entity.name}.${policy.fieldName} must target a Reference Field.`,
    );
  }
  if (
    policy.actions.length === 0 ||
    policy.actions.some(action => action !== 'link' && action !== 'unlink')
  ) {
    throw new Error(
      `Graph Command policy ${policy.entity.name}.${policy.fieldName} requires valid actions.`,
    );
  }
  return field;
};

const validateEntityMutationActionDeclaration = (
  policy: AnyEntityMutationCommandPolicy,
  action: string,
  declaration: unknown,
) => {
  if (!isRecord(declaration) || !Array.isArray(declaration.result)) {
    throw new Error(
      `Entity Mutation Command policy ${policy.entity.name}.${action} requires a result Field allowlist.`,
    );
  }

  let mutationFields: unknown[] = [];
  if (action !== 'delete') {
    if (!Array.isArray(declaration.fields)) {
      throw new Error(
        `Entity Mutation Command policy ${policy.entity.name}.${action} requires a mutation Field allowlist.`,
      );
    }
    mutationFields = declaration.fields;
  }

  const hasConditionDeclaration = 'if' in declaration;
  const conditionFields = hasConditionDeclaration ? declaration.if : [];
  if (
    (action === 'create' && hasConditionDeclaration) ||
    (conditionFields !== undefined && !Array.isArray(conditionFields))
  ) {
    throw new Error(
      `Entity Mutation Command policy ${policy.entity.name}.${action} requires a condition Field allowlist only for update/delete.`,
    );
  }

  const resultFields = declaration.result;
  const effectiveConditionFields = conditionFields ?? [];
  const fields = [...mutationFields, ...effectiveConditionFields, ...resultFields];
  if (
    (action !== 'delete' && mutationFields.length === 0) ||
    new Set(mutationFields).size !== mutationFields.length ||
    new Set(effectiveConditionFields).size !== effectiveConditionFields.length ||
    new Set(resultFields).size !== resultFields.length ||
    fields.some(fieldName => {
      const field = typeof fieldName === 'string' ? policy.entity.fields[fieldName] : undefined;
      return !field || isDerivedFieldDefinition(field);
    })
  ) {
    throw new Error(
      `Entity Mutation Command policy ${policy.entity.name}.${action} must allow stored mutation and result Fields exactly once per allowlist.`,
    );
  }
};

const validateEntityMutationPolicy = (policy: AnyEntityMutationCommandPolicy) => {
  if (policy.scope !== 'all') {
    throw new Error(
      `Entity Mutation Command policy ${policy.entity.name} requires explicit "all" scope.`,
    );
  }
  const actions = Object.entries(policy.actions);
  if (
    actions.length === 0 ||
    actions.some(([action]) => !['create', 'update', 'delete'].includes(action))
  ) {
    throw new Error(`Entity Mutation Command policy ${policy.entity.name} requires valid actions.`);
  }
  for (const [action, declaration] of actions) {
    validateEntityMutationActionDeclaration(policy, action, declaration);
  }
};

const isEntityMutationPolicy = (
  policy: AnyGraphCommandPolicy,
): policy is AnyEntityMutationCommandPolicy => !Array.isArray(policy.actions);

export const createGraphCommandDispatcher = <TAuthority = unknown>({
  policies,
  execute,
  executeManyToMany,
  executeEntityMutation,
  reportError,
}: CreateGraphCommandDispatcherOptions<TAuthority>) => {
  const policyByRelation = new Map<
    string,
    { policy: RelationshipCommandPolicy; target: AnyEntityDefinition }
  >();
  const manyToManyPolicyByRelation = new Map<
    string,
    { policy: ManyToManyRelationshipCommandPolicy; target: AnyEntityDefinition }
  >();
  const entityMutationPolicyByEntity = new Map<string, AnyEntityMutationCommandPolicy>();
  for (const policy of policies) {
    if (isEntityMutationPolicy(policy)) {
      validateEntityMutationPolicy(policy);
      if (entityMutationPolicyByEntity.has(policy.entity.name)) {
        throw new Error(
          `Duplicate Entity Mutation Command policy for Entity ${policy.entity.name}.`,
        );
      }
      entityMutationPolicyByEntity.set(policy.entity.name, policy);
      continue;
    }
    if ('relationName' in policy) {
      const relation = policy.entity.relations[policy.relationName];
      if (relation?.relationKind !== 'manyToMany') {
        throw new Error(
          `Graph Command policy ${policy.entity.name}.${policy.relationName} must target a many-to-many Relation.`,
        );
      }
      if (
        policy.actions.length === 0 ||
        policy.actions.some(action => action !== 'link' && action !== 'unlink')
      ) {
        throw new Error(
          `Graph Command policy ${policy.entity.name}.${policy.relationName} requires valid actions.`,
        );
      }
      const key = policyKey(policy.entity.name, policy.relationName, relation.target.name);
      if (manyToManyPolicyByRelation.has(key)) {
        throw new Error(
          `Duplicate Graph Command policy for Relation ${policy.entity.name}.${policy.relationName}.`,
        );
      }
      manyToManyPolicyByRelation.set(key, { policy, target: relation.target });
      continue;
    }
    const field = validatePolicy(policy);
    const key = policyKey(policy.entity.name, policy.fieldName, field.target.name);
    if (policyByRelation.has(key)) {
      throw new Error(
        `Duplicate Graph Command policy for Relation ${policy.entity.name}.${policy.fieldName}.`,
      );
    }
    policyByRelation.set(key, { policy, target: field.target });
  }

  const executeSafely = async (
    command: RelationshipCommand | ManyToManyRelationshipCommand,
    run: () => Promise<RelationshipCommandResult>,
  ): Promise<GraphCommandDispatchResponse> => {
    try {
      const value = await run();
      if (!isRelationshipCommandResult(value) || !isJsonValue(value)) {
        throw new Error('Relationship Command result must be valid and JSON-safe.');
      }
      return { kind: 'graph-command-result', value: cloneJson(value) };
    } catch (error) {
      reportError?.(error);
      const diagnostic = relationshipCommandDiagnosticFromError(error, command);
      if (diagnostic) return { kind: 'graph-command-rejection', diagnostic };
      return graphCommandProtocolError(
        'execution_unavailable',
        'Data graph Command execution is temporarily unavailable.',
      );
    }
  };

  const executeEntityMutationSafely = async (
    command: EntityMutationCommand,
    resultFields: readonly string[],
    run: () => Promise<EntityMutationDelta>,
  ): Promise<GraphCommandDispatchResponse> => {
    try {
      const value = await run();
      const projected = Object.fromEntries(
        (['created', 'updated', 'deleted'] as const).map(bucket => [
          bucket,
          value[bucket].map(fact => ({
            ...fact,
            values: Object.fromEntries(
              resultFields.flatMap(fieldName =>
                hasOwn(fact.values, fieldName) ? [[fieldName, fact.values[fieldName]]] : [],
              ),
            ),
          })),
        ]),
      ) as EntityMutationDelta;
      if (!isExactEntityMutationDelta(projected, command) || !isJsonValue(projected)) {
        throw new Error('Entity Mutation Command delta must be exact, valid, and JSON-safe.');
      }
      return { kind: 'graph-command-result', value: cloneJson(projected) };
    } catch (error) {
      reportError?.(error);
      const diagnostic = entityMutationCommandDiagnosticFromError(error, command);
      if (diagnostic) return { kind: 'graph-command-rejection', diagnostic };
      return graphCommandProtocolError(
        'execution_unavailable',
        'Data graph Command execution is temporarily unavailable.',
      );
    }
  };

  const dispatchEntityMutation = async (
    request: Parameters<typeof resolveGraphCommandRequest>[0],
    command: EntityMutationCommand,
    context: GraphCommandDispatchContext<TAuthority>,
  ): Promise<GraphCommandDispatchResponse> => {
    const policy = entityMutationPolicyByEntity.get(command.entityName);
    if (!policy) {
      return graphCommandProtocolError('access_denied', 'Data graph Command access denied.');
    }
    const declaration = policy.actions[command.action];
    const declarationFields =
      isRecord(declaration) && 'fields' in declaration ? declaration.fields : undefined;
    const conditionFields =
      isRecord(declaration) && 'if' in declaration && Array.isArray(declaration.if)
        ? declaration.if
        : undefined;
    const commandConditionFields =
      command.action !== 'create' && command.if ? Object.keys(command.if) : [];
    const allowed =
      isRecord(declaration) &&
      (command.action === 'delete' ||
        (Array.isArray(declarationFields) &&
          Object.keys(command.values).every(fieldName => declarationFields.includes(fieldName)))) &&
      (commandConditionFields.length === 0 ||
        (conditionFields !== undefined &&
          commandConditionFields.every(fieldName => conditionFields.includes(fieldName))));
    if (!allowed) {
      return graphCommandProtocolError('access_denied', 'Data graph Command access denied.');
    }
    const resolved = resolveGraphCommandRequest(request, { entities: [policy.entity] });
    if (!resolved.success) return resolved.error;
    if (resolved.command.kind !== 'entity-mutation-command') {
      return graphCommandProtocolError('invalid_request', 'Data graph Command kind changed.');
    }
    if (!executeEntityMutation) {
      return graphCommandProtocolError(
        'execution_unavailable',
        'Entity Mutation Command execution is unavailable.',
      );
    }
    const resolvedCommand = resolved.command;
    return executeEntityMutationSafely(resolvedCommand, declaration.result as string[], () =>
      executeEntityMutation(resolvedCommand, context),
    );
  };

  const dispatchManyToMany = async (
    request: Parameters<typeof resolveGraphCommandRequest>[0],
    command: ManyToManyRelationshipCommand,
    context: GraphCommandDispatchContext<TAuthority>,
  ): Promise<GraphCommandDispatchResponse> => {
    const registered = manyToManyPolicyByRelation.get(
      policyKey(
        command.relation.sourceEntityName,
        command.relation.relationName,
        command.relation.targetEntityName,
      ),
    );
    if (!registered?.policy.actions.includes(command.action)) {
      return graphCommandProtocolError('access_denied', 'Data graph Command access denied.');
    }
    const resolved = resolveGraphCommandRequest(request, {
      entities: [registered.policy.entity, registered.target],
    });
    if (!resolved.success) return resolved.error;
    const resolvedCommand = resolved.command;
    if (resolvedCommand.kind !== 'many-to-many-relationship-command') {
      return graphCommandProtocolError('invalid_request', 'Data graph Command kind changed.');
    }
    if (!executeManyToMany) {
      return graphCommandProtocolError(
        'execution_unavailable',
        'Many-to-many Relationship Command execution is unavailable.',
      );
    }
    return executeSafely(resolvedCommand, () => executeManyToMany(resolvedCommand, context));
  };

  const dispatchDirect = async (
    request: Parameters<typeof resolveGraphCommandRequest>[0],
    command: RelationshipCommand,
    context: GraphCommandDispatchContext<TAuthority>,
  ): Promise<GraphCommandDispatchResponse> => {
    const registered = policyByRelation.get(
      policyKey(
        command.relation.sourceEntityName,
        command.relation.fieldName,
        command.relation.targetEntityName,
      ),
    );
    if (!registered?.policy.actions.includes(command.action)) {
      return graphCommandProtocolError('access_denied', 'Data graph Command access denied.');
    }
    const resolved = resolveGraphCommandRequest(request, {
      entities: [registered.policy.entity, registered.target],
    });
    if (!resolved.success) return resolved.error;
    const resolvedCommand = resolved.command;
    if (resolvedCommand.kind !== 'relationship-command') {
      return graphCommandProtocolError('invalid_request', 'Data graph Command kind changed.');
    }
    if (!execute) {
      return graphCommandProtocolError(
        'execution_unavailable',
        'Relationship Command execution is unavailable.',
      );
    }
    return executeSafely(resolvedCommand, () => execute(resolvedCommand, context));
  };

  return async (
    input: unknown,
    context: GraphCommandDispatchContext<TAuthority>,
  ): Promise<GraphCommandDispatchResponse> => {
    const parsed = parseGraphCommandRequest(input);
    if (!parsed.success) return parsed.error;

    const command = parsed.request.command;
    if (command.kind === 'entity-mutation-command') {
      return dispatchEntityMutation(parsed.request, command, context);
    }
    return command.kind === 'many-to-many-relationship-command'
      ? dispatchManyToMany(parsed.request, command, context)
      : dispatchDirect(parsed.request, command, context);
  };
};

export type GraphCommandDispatcher<TAuthority = unknown> = ReturnType<
  typeof createGraphCommandDispatcher<TAuthority>
>;
