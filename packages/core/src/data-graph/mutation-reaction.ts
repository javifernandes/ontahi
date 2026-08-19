import type {
  CanonicalRelationIdentity,
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
  command: RelationshipCommand;
  delta: RelationshipDelta;
  causality: MutationCausality;
};

export type AppliedMutationOutcome = AppliedRelationshipMutationOutcome;

export type ExecuteRelationshipCommandIntent = {
  kind: 'execute-relationship-command';
  command: RelationshipCommand;
};

export type MutationReactionIntent = ExecuteRelationshipCommandIntent;

export type MutationReactionMatch = {
  mutationKind: AppliedMutationOutcome['mutationKind'];
  action?: RelationshipCommand['action'];
  relation?: CanonicalRelationIdentity;
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
    | 'durable_acceptance_unavailable'
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
  acceptDurableReaction?: (
    envelope: DurableMutationReactionEnvelope,
  ) => Promise<DurableMutationReactionAcceptance>;
  createOutcomeId: () => string;
  maxDepth?: number;
};

const sameRelation = (left: CanonicalRelationIdentity, right: CanonicalRelationIdentity) =>
  left.sourceEntityName === right.sourceEntityName &&
  left.fieldName === right.fieldName &&
  left.targetEntityName === right.targetEntityName;

const matches = (reaction: MutationReaction, outcome: AppliedMutationOutcome) =>
  reaction.when.mutationKind === outcome.mutationKind &&
  (!reaction.when.action || reaction.when.action === outcome.command.action) &&
  (!reaction.when.relation || sameRelation(reaction.when.relation, outcome.command.relation));

export const createMutationReactionRunner = ({
  reactions,
  executeRelationshipCommand,
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

  const apply = async (
    command: RelationshipCommand,
    parent?: AppliedMutationOutcome,
  ): Promise<AppliedMutationOutcome> => {
    const outcomeId = createOutcomeId();
    if (outcomeId.length === 0) {
      throw new Error('Applied Mutation Outcomes require a non-empty id.');
    }
    const delta = await executeRelationshipCommand(command);
    return {
      kind: 'applied-mutation-outcome',
      mutationKind: 'relationship-command',
      command,
      delta,
      causality: {
        outcomeId,
        rootOutcomeId: parent?.causality.rootOutcomeId ?? outcomeId,
        ...(parent ? { parentOutcomeId: parent.causality.outcomeId } : {}),
        depth: parent ? parent.causality.depth + 1 : 0,
      },
    };
  };

  return async (command: RelationshipCommand): Promise<MutationReactionResult> => {
    const root = await apply(command);
    const pending = [root];
    const executions: MutationReactionExecution[] = [];

    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      const source = pending[cursor]!;
      for (const reaction of reactions) {
        if (!matches(reaction, source)) continue;
        let intents: readonly MutationReactionIntent[];
        try {
          intents = reaction.react(source);
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
            try {
              const acceptance = await acceptDurableReaction({
                kind: 'durable-mutation-reaction',
                reactionId: reaction.id,
                reactionKey: execution.reactionKey,
                source,
                intent,
              });
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
            const outcome = await apply(intent.command, source);
            pending.push(outcome);
            executions.push({ ...execution, status: 'applied', outcome });
          } catch {
            executions.push({
              ...execution,
              status: 'failed',
              failure: {
                code: 'follow_up_failed',
                message: 'Post-commit Relationship Command failed.',
              },
            });
          }
        }
      }
    }

    return { root, reactions: executions };
  };
};
