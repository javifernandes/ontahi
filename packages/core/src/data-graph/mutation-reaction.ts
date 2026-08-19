import { isJsonValue } from '../value/json.js';

import type { EntityMutationCommand, EntityMutationDelta } from './entity-mutation-command.js';
import type {
  CanonicalManyToManyRelationIdentity,
  CanonicalRelationIdentity,
  ManyToManyRelationshipCommand,
  RelationshipCommand,
  RelationshipDelta,
} from './relationship-command.js';

export type MutationCausality = {
  outcomeId: string;
  rootOutcomeId: string;
  parentOutcomeId?: string;
  depth: number;
};

export type AppliedRelationshipMutationOutcome = {
  kind: 'applied-mutation-outcome';
  mutationKind: 'relationship-command';
  command: RelationshipCommand | ManyToManyRelationshipCommand;
  delta: RelationshipDelta;
  causality: MutationCausality;
};

export type AppliedEntityMutationOutcome = {
  kind: 'applied-mutation-outcome';
  mutationKind: 'entity-mutation-command';
  command: EntityMutationCommand;
  delta: EntityMutationDelta;
  causality: MutationCausality;
};

export type AppliedMutationOutcome =
  | AppliedRelationshipMutationOutcome
  | AppliedEntityMutationOutcome;

export type ExecuteRelationshipCommandIntent = {
  kind: 'execute-relationship-command';
  command: RelationshipCommand;
};

export type ExecuteManyToManyRelationshipCommandIntent = {
  kind: 'execute-many-to-many-relationship-command';
  command: ManyToManyRelationshipCommand;
};

export type ExecuteEntityMutationCommandIntent = {
  kind: 'execute-entity-mutation-command';
  command: EntityMutationCommand;
};

export type InvokeOperationReactionIntent = {
  kind: 'invoke-operation';
  request: {
    kind: 'invoke';
    operationId: string;
    input?: unknown;
  };
};

export type EmitEventReactionIntent = {
  kind: 'emit-event';
  event: unknown;
};

export type MutationReactionIntent =
  | ExecuteRelationshipCommandIntent
  | ExecuteManyToManyRelationshipCommandIntent
  | ExecuteEntityMutationCommandIntent
  | InvokeOperationReactionIntent
  | EmitEventReactionIntent;

export type MutationReactionMatch =
  | {
      mutationKind: 'relationship-command';
      action?: RelationshipCommand['action'] | ManyToManyRelationshipCommand['action'];
      relation?: CanonicalRelationIdentity | CanonicalManyToManyRelationIdentity;
    }
  | {
      mutationKind: 'entity-mutation-command';
      action?: EntityMutationCommand['action'];
      entityName?: string;
    };

export type MutationReaction = {
  id: string;
  delivery: 'inline' | 'best-effort' | 'durable';
  when: MutationReactionMatch;
  react: (outcome: AppliedMutationOutcome) => readonly MutationReactionIntent[];
};

export type MutationReactionFailure = {
  code:
    | 'reaction_failed'
    | 'follow_up_failed'
    | 'max_depth_exceeded'
    | 'follow_up_unavailable'
    | 'durable_acceptance_unavailable'
    | 'durable_intent_not_serializable'
    | 'durable_acceptance_failed';
  message: string;
};

export type DurableMutationReactionEnvelope = {
  kind: 'durable-mutation-reaction';
  reactionId: string;
  reactionKey: string;
  source: AppliedMutationOutcome;
  intent: MutationReactionIntent;
};

export type DurableMutationReactionAcceptance = {
  acceptanceId: string;
};

export type MutationReactionExecution = {
  reactionId: string;
  reactionKey: string;
  sourceOutcomeId: string;
  delivery: MutationReaction['delivery'];
  intentIndex?: number;
} & (
  | { status: 'applied'; outcome: AppliedMutationOutcome }
  | { status: 'completed'; result: unknown }
  | { status: 'emitted' }
  | { status: 'accepted'; acceptance: DurableMutationReactionAcceptance }
  | { status: 'failed' | 'depth-exceeded'; failure: MutationReactionFailure }
);

export type MutationReactionResult = {
  root: AppliedMutationOutcome;
  reactions: MutationReactionExecution[];
};

export type CreateMutationReactionRunnerOptions = {
  reactions: readonly MutationReaction[];
  executeRelationshipCommand: (command: RelationshipCommand) => Promise<RelationshipDelta>;
  executeManyToManyRelationshipCommand?: (
    command: ManyToManyRelationshipCommand,
  ) => Promise<RelationshipDelta>;
  executeEntityMutationCommand?: (command: EntityMutationCommand) => Promise<EntityMutationDelta>;
  invokeOperation?: (request: InvokeOperationReactionIntent['request']) => Promise<unknown>;
  emitEvent?: (event: unknown) => Promise<void>;
  acceptDurableReaction?: (
    envelope: DurableMutationReactionEnvelope,
  ) => Promise<DurableMutationReactionAcceptance>;
  createOutcomeId: () => string;
  maxDepth?: number;
};

const sameRelation = (
  left: CanonicalRelationIdentity | CanonicalManyToManyRelationIdentity,
  right: CanonicalRelationIdentity | CanonicalManyToManyRelationIdentity,
) =>
  left.sourceEntityName === right.sourceEntityName &&
  left.targetEntityName === right.targetEntityName &&
  ('fieldName' in left
    ? 'fieldName' in right && left.fieldName === right.fieldName
    : 'relationName' in right && left.relationName === right.relationName);

const reactToOutcome = (
  reaction: MutationReaction,
  outcome: AppliedMutationOutcome,
): readonly MutationReactionIntent[] | undefined => {
  if (reaction.when.mutationKind === 'relationship-command') {
    if (
      outcome.mutationKind !== 'relationship-command' ||
      (reaction.when.action && reaction.when.action !== outcome.command.action) ||
      (reaction.when.relation && !sameRelation(reaction.when.relation, outcome.command.relation))
    ) {
      return undefined;
    }
    return reaction.react(outcome);
  }
  if (
    outcome.mutationKind !== 'entity-mutation-command' ||
    (reaction.when.action && reaction.when.action !== outcome.command.action) ||
    (reaction.when.entityName && reaction.when.entityName !== outcome.command.entityName)
  ) {
    return undefined;
  }
  return reaction.react(outcome);
};

export const createMutationReactionRunner = ({
  reactions,
  executeRelationshipCommand,
  executeManyToManyRelationshipCommand,
  executeEntityMutationCommand,
  invokeOperation,
  emitEvent,
  acceptDurableReaction,
  createOutcomeId,
  maxDepth = 8,
}: CreateMutationReactionRunnerOptions) => {
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new Error('Mutation Reaction maximum depth must be a non-negative integer.');
  }
  if (reactions.some(reaction => reaction.id.length === 0)) {
    throw new Error('Mutation Reactions require a non-empty id.');
  }
  if (new Set(reactions.map(reaction => reaction.id)).size !== reactions.length) {
    throw new Error('Mutation Reaction ids must be unique.');
  }

  const causalityFor = (parent?: AppliedMutationOutcome): MutationCausality => {
    const outcomeId = createOutcomeId();
    if (outcomeId.length === 0) {
      throw new Error('Applied Mutation Outcomes require a non-empty id.');
    }
    return {
      outcomeId,
      rootOutcomeId: parent?.causality.rootOutcomeId ?? outcomeId,
      ...(parent ? { parentOutcomeId: parent.causality.outcomeId } : {}),
      depth: parent ? parent.causality.depth + 1 : 0,
    };
  };

  const applyRelationship = async (
    command: RelationshipCommand,
    parent?: AppliedMutationOutcome,
  ): Promise<AppliedRelationshipMutationOutcome> => {
    const causality = causalityFor(parent);
    const delta = await executeRelationshipCommand(command);
    return {
      kind: 'applied-mutation-outcome',
      mutationKind: 'relationship-command',
      command,
      delta,
      causality,
    };
  };

  const applyManyToManyRelationship = async (
    command: ManyToManyRelationshipCommand,
    parent: AppliedMutationOutcome,
  ): Promise<AppliedRelationshipMutationOutcome> => {
    if (!executeManyToManyRelationshipCommand) {
      throw new Error('Many-to-many Relationship execution for Mutation Reactions is unavailable.');
    }
    const causality = causalityFor(parent);
    const delta = await executeManyToManyRelationshipCommand(command);
    return {
      kind: 'applied-mutation-outcome',
      mutationKind: 'relationship-command',
      command,
      delta,
      causality,
    };
  };

  const applyEntityMutation = async (
    command: EntityMutationCommand,
    parent: AppliedMutationOutcome,
  ): Promise<AppliedEntityMutationOutcome> => {
    if (!executeEntityMutationCommand) {
      throw new Error('Entity mutation execution for Mutation Reactions is unavailable.');
    }
    const causality = causalityFor(parent);
    const delta = await executeEntityMutationCommand(command);
    return {
      kind: 'applied-mutation-outcome',
      mutationKind: 'entity-mutation-command',
      command,
      delta,
      causality,
    };
  };

  return async (command: RelationshipCommand): Promise<MutationReactionResult> => {
    const root = await applyRelationship(command);
    const pending: AppliedMutationOutcome[] = [root];
    const executions: MutationReactionExecution[] = [];

    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      const source = pending[cursor]!;
      for (const reaction of reactions) {
        let intents: readonly MutationReactionIntent[];
        try {
          const matchedIntents = reactToOutcome(reaction, source);
          if (!matchedIntents) continue;
          intents = matchedIntents;
        } catch {
          executions.push({
            reactionId: reaction.id,
            reactionKey: `${reaction.id}:${source.causality.outcomeId}`,
            sourceOutcomeId: source.causality.outcomeId,
            delivery: reaction.delivery,
            status: 'failed',
            failure: {
              code: 'reaction_failed',
              message: 'Post-commit Reaction evaluation failed.',
            },
          });
          continue;
        }
        for (const [intentIndex, intent] of intents.entries()) {
          const execution = {
            reactionId: reaction.id,
            reactionKey: `${reaction.id}:${source.causality.outcomeId}:${intentIndex}`,
            sourceOutcomeId: source.causality.outcomeId,
            delivery: reaction.delivery,
            intentIndex,
          };
          if (source.causality.depth >= maxDepth) {
            executions.push({
              ...execution,
              status: 'depth-exceeded',
              failure: {
                code: 'max_depth_exceeded',
                message: `Post-commit Reaction exceeded maximum depth ${maxDepth}.`,
              },
            });
            continue;
          }

          if (reaction.delivery === 'durable') {
            if (!acceptDurableReaction) {
              executions.push({
                ...execution,
                status: 'failed',
                failure: {
                  code: 'durable_acceptance_unavailable',
                  message: 'Durable Mutation Reaction acceptance is unavailable.',
                },
              });
              continue;
            }
            const envelope: DurableMutationReactionEnvelope = {
              kind: 'durable-mutation-reaction',
              reactionId: reaction.id,
              reactionKey: execution.reactionKey,
              source,
              intent,
            };
            if (!isJsonValue(envelope)) {
              executions.push({
                ...execution,
                status: 'failed',
                failure: {
                  code: 'durable_intent_not_serializable',
                  message: 'Durable Mutation Reaction intent must be serializable.',
                },
              });
              continue;
            }
            try {
              const acceptance = await acceptDurableReaction(envelope);
              if (acceptance.acceptanceId.length === 0) {
                throw new Error('Durable acceptance requires a non-empty id.');
              }
              executions.push({ ...execution, status: 'accepted', acceptance });
            } catch {
              executions.push({
                ...execution,
                status: 'failed',
                failure: {
                  code: 'durable_acceptance_failed',
                  message: 'Durable Mutation Reaction acceptance failed.',
                },
              });
            }
            continue;
          }

          try {
            if (intent.kind === 'execute-relationship-command') {
              const outcome = await applyRelationship(intent.command, source);
              pending.push(outcome);
              executions.push({ ...execution, status: 'applied', outcome });
              continue;
            }
            if (intent.kind === 'execute-many-to-many-relationship-command') {
              const outcome = await applyManyToManyRelationship(intent.command, source);
              pending.push(outcome);
              executions.push({ ...execution, status: 'applied', outcome });
              continue;
            }
            if (intent.kind === 'execute-entity-mutation-command') {
              const outcome = await applyEntityMutation(intent.command, source);
              pending.push(outcome);
              executions.push({ ...execution, status: 'applied', outcome });
              continue;
            }
            if (intent.kind === 'invoke-operation') {
              if (!invokeOperation) {
                executions.push({
                  ...execution,
                  status: 'failed',
                  failure: {
                    code: 'follow_up_unavailable',
                    message: 'Operation invocation for Mutation Reactions is unavailable.',
                  },
                });
                continue;
              }
              const result = await invokeOperation(intent.request);
              executions.push({ ...execution, status: 'completed', result });
              continue;
            }
            if (!emitEvent) {
              executions.push({
                ...execution,
                status: 'failed',
                failure: {
                  code: 'follow_up_unavailable',
                  message: 'Event emission for Mutation Reactions is unavailable.',
                },
              });
              continue;
            }
            await emitEvent(intent.event);
            executions.push({ ...execution, status: 'emitted' });
          } catch {
            executions.push({
              ...execution,
              status: 'failed',
              failure: {
                code: 'follow_up_failed',
                message: 'Post-commit follow-up intent failed.',
              },
            });
          }
        }
      }
    }

    return { root, reactions: executions };
  };
};
