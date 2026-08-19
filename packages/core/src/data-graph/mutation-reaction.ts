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
  when: MutationReactionMatch;
  react: (outcome: AppliedMutationOutcome) => readonly MutationReactionIntent[];
};

export type MutationReactionFailure = {
  code: 'reaction_failed' | 'follow_up_failed' | 'max_depth_exceeded';
  message: string;
};

export type MutationReactionExecution = {
  reactionId: string;
  reactionKey: string;
  sourceOutcomeId: string;
  intentIndex?: number;
} & (
  | { status: 'applied'; outcome: AppliedMutationOutcome }
  | { status: 'failed' | 'depth-exceeded'; failure: MutationReactionFailure }
);

export type MutationReactionResult = {
  root: AppliedMutationOutcome;
  reactions: MutationReactionExecution[];
};

export type CreateMutationReactionRunnerOptions = {
  reactions: readonly MutationReaction[];
  executeRelationshipCommand: (command: RelationshipCommand) => Promise<RelationshipDelta>;
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
