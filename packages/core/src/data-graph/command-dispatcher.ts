import { cloneJson, isJsonValue } from '../value/json.js';

import {
  graphCommandProtocolError,
  parseGraphCommandRequest,
  resolveGraphCommandRequest,
  type GraphCommandProtocolError,
} from './command-protocol.js';
import { isReferenceFieldDefinition, type AnyEntityDefinition } from './definitions.js';
import type { RelationshipCommand, RelationshipDelta } from './relationship-command.js';

export type RelationshipCommandPolicy<TEntity extends AnyEntityDefinition = AnyEntityDefinition> = {
  readonly entity: TEntity;
  readonly fieldName: keyof TEntity['fields'] & string;
  readonly actions: readonly RelationshipCommand['action'][];
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

export type CreateGraphCommandDispatcherOptions<TAuthority> = {
  readonly policies: readonly RelationshipCommandPolicy[];
  readonly execute: GraphCommandDispatchExecutor<TAuthority>;
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
  reportError,
}: CreateGraphCommandDispatcherOptions<TAuthority>) => {
  const policyByRelation = new Map<
    string,
    { policy: RelationshipCommandPolicy; target: AnyEntityDefinition }
  >();
  for (const policy of policies) {
    const field = validatePolicy(policy);
    const key = policyKey(policy.entity.name, policy.fieldName, field.target.name);
    if (policyByRelation.has(key)) {
      throw new Error(
        `Duplicate Graph Command policy for Relation ${policy.entity.name}.${policy.fieldName}.`,
      );
    }
    policyByRelation.set(key, { policy, target: field.target });
  }

  return async (
    input: unknown,
    context: GraphCommandDispatchContext<TAuthority>,
  ): Promise<GraphCommandDispatchResponse> => {
    const parsed = parseGraphCommandRequest(input);
    if (!parsed.success) return parsed.error;

    const { relation, action } = parsed.request.command;
    const registered = policyByRelation.get(
      policyKey(relation.sourceEntityName, relation.fieldName, relation.targetEntityName),
    );
    if (!registered || !registered.policy.actions.includes(action)) {
      return graphCommandProtocolError('access_denied', 'Data graph Command access denied.');
    }

    const resolved = resolveGraphCommandRequest(parsed.request, {
      entities: [registered.policy.entity, registered.target],
    });
    if (!resolved.success) return resolved.error;

    try {
      const value = await execute(resolved.command, context);
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
};
