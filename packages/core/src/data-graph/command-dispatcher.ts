import { cloneJson, isJsonValue } from '../value/json.js';

import {
  graphCommandProtocolError,
  parseGraphCommandRequest,
  resolveGraphCommandRequest,
  type GraphCommandProtocolError,
} from './command-protocol.js';
import { isReferenceFieldDefinition, type AnyEntityDefinition } from './definitions.js';
import type {
  ManyToManyRelationshipCommand,
  RelationshipCommand,
  RelationshipDelta,
} from './relationship-command.js';

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

export type GraphCommandDispatchContext<TAuthority> = {
  readonly authority: TAuthority;
};

export type GraphCommandDispatchResponse =
  | { readonly kind: 'graph-command-result'; readonly value: RelationshipDelta }
  | GraphCommandProtocolError;

export type GraphCommandDispatchExecutor<TAuthority> = (
  command: RelationshipCommand,
  context: GraphCommandDispatchContext<TAuthority>,
) => Promise<RelationshipDelta>;

export type ManyToManyGraphCommandDispatchExecutor<TAuthority> = (
  command: ManyToManyRelationshipCommand,
  context: GraphCommandDispatchContext<TAuthority>,
) => Promise<RelationshipDelta>;

export type CreateGraphCommandDispatcherOptions<TAuthority> = {
  readonly policies: readonly (RelationshipCommandPolicy | ManyToManyRelationshipCommandPolicy)[];
  readonly execute: GraphCommandDispatchExecutor<TAuthority>;
  readonly executeManyToMany?: ManyToManyGraphCommandDispatchExecutor<TAuthority>;
  readonly reportError?: (error: unknown) => void;
};

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

export const createGraphCommandDispatcher = <TAuthority = unknown>({
  policies,
  execute,
  executeManyToMany,
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
  for (const policy of policies) {
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
    run: () => Promise<RelationshipDelta>,
  ): Promise<GraphCommandDispatchResponse> => {
    try {
      const value = await run();
      if (!isJsonValue(value)) throw new Error('Relationship Delta must be JSON-safe.');
      return { kind: 'graph-command-result', value: cloneJson(value) };
    } catch (error) {
      reportError?.(error);
      return graphCommandProtocolError(
        'execution_unavailable',
        'Data graph Command execution is temporarily unavailable.',
      );
    }
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
    return executeSafely(() => executeManyToMany(resolvedCommand, context));
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
    return executeSafely(() => execute(resolvedCommand, context));
  };

  return async (
    input: unknown,
    context: GraphCommandDispatchContext<TAuthority>,
  ): Promise<GraphCommandDispatchResponse> => {
    const parsed = parseGraphCommandRequest(input);
    if (!parsed.success) return parsed.error;

    const command = parsed.request.command;
    return command.kind === 'many-to-many-relationship-command'
      ? dispatchManyToMany(parsed.request, command, context)
      : dispatchDirect(parsed.request, command, context);
  };
};

export type GraphCommandDispatcher<TAuthority = unknown> = ReturnType<
  typeof createGraphCommandDispatcher<TAuthority>
>;
