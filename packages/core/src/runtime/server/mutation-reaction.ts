import { Effect } from 'effect';

import type {
  EntityMutationCommand,
  EntityMutationDelta,
} from '../../data-graph/entity-mutation-command.js';
import {
  createMutationReactionRunner,
  type AppliedRelationshipMutationResult,
  type InvokeOperationReactionIntent,
  type MutationReaction,
  type MutationReactionResult,
  type RelationshipMutationResult,
} from '../../data-graph/mutation-reaction.js';
import type { RelationshipCommandResult } from '../../data-graph/relationship-command-result.js';
import type {
  ManyToManyRelationshipCommand,
  OrderedRelationshipCommand,
  RelationshipCommand,
  RelationshipCommandExecutor,
} from '../../data-graph/relationship-command.js';

import { deferDataGraphPostCommitWork, getRequiredDataGraphRuntime } from './data-graph.js';
import { recordAppliedMutationOutcome } from './unit-of-work.js';

export type ContextualMutationReactionExecutorOptions = {
  getReactions: () => readonly MutationReaction[];
  invokeOperation?: (request: InvokeOperationReactionIntent['request']) => Promise<unknown>;
  emitEvent?: (event: unknown) => Promise<void>;
  createOutcomeId?: () => string;
  maxDepth?: number;
};

let outcomeSequence = 0;
const createDefaultOutcomeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `mutation-outcome-${Date.now()}-${++outcomeSequence}`;

const recordAppliedReactionOutcomes = (result: MutationReactionResult) => {
  for (const reaction of result.reactions) {
    if (reaction.status === 'applied') recordAppliedMutationOutcome(reaction.outcome);
  }
};

const createContextualRunner = <TError, TOptions>(
  {
    getReactions,
    invokeOperation,
    emitEvent,
    createOutcomeId = createDefaultOutcomeId,
    maxDepth,
  }: ContextualMutationReactionExecutorOptions,
  options?: TOptions,
) =>
  createMutationReactionRunner({
    reactions: getReactions(),
    executeRelationshipCommand: followUp => {
      const runtime =
        getRequiredDataGraphRuntime<
          Partial<RelationshipCommandExecutor<TError, TOptions, RelationshipCommandResult>>
        >();
      if (typeof runtime.runRelationshipCommand !== 'function') {
        throw new TypeError(
          'The current Data Graph runtime does not support direct Relationship Command execution.',
        );
      }
      return Effect.runPromise(runtime.runRelationshipCommand(followUp, options));
    },
    executeManyToManyRelationshipCommand: followUp => {
      const runtime =
        getRequiredDataGraphRuntime<
          Partial<RelationshipCommandExecutor<TError, TOptions, RelationshipCommandResult>>
        >();
      if (typeof runtime.runManyToManyRelationshipCommand !== 'function') {
        throw new TypeError(
          'The current Data Graph runtime does not support many-to-many Relationship Command execution.',
        );
      }
      return Effect.runPromise(runtime.runManyToManyRelationshipCommand(followUp, options));
    },
    executeOrderedRelationshipCommand: followUp => {
      const runtime =
        getRequiredDataGraphRuntime<
          Partial<RelationshipCommandExecutor<TError, TOptions, RelationshipCommandResult>>
        >();
      if (typeof runtime.runOrderedRelationshipCommand !== 'function') {
        throw new TypeError(
          'The current Data Graph runtime does not support ordered Relationship Command execution.',
        );
      }
      return Effect.runPromise(runtime.runOrderedRelationshipCommand(followUp, options));
    },
    invokeOperation,
    emitEvent,
    createOutcomeId,
    ...(maxDepth === undefined ? {} : { maxDepth }),
  });

export const applyContextualEntityMutationReactions = <TError = unknown, TOptions = undefined>(
  command: EntityMutationCommand,
  delta: EntityMutationDelta,
  options: TOptions | undefined,
  configuration: ContextualMutationReactionExecutorOptions,
): Effect.Effect<EntityMutationDelta> =>
  Effect.suspend(() => {
    const runner = createContextualRunner<TError, TOptions>(configuration, options);
    const outcome = runner.createAppliedEntityOutcome(command, delta);
    recordAppliedMutationOutcome(outcome);
    const process = () =>
      runner.react(outcome).then(result => {
        recordAppliedReactionOutcomes(result);
      });

    return deferDataGraphPostCommitWork(process)
      ? Effect.succeed(delta)
      : Effect.promise(process).pipe(Effect.as(delta));
  });

export const applyContextualRelationshipMutationReactions = <
  TError = unknown,
  TOptions = undefined,
>(
  command: RelationshipCommand | ManyToManyRelationshipCommand | OrderedRelationshipCommand,
  result: RelationshipCommandResult,
  options: TOptions | undefined,
  configuration: ContextualMutationReactionExecutorOptions,
): Effect.Effect<RelationshipMutationResult> =>
  Effect.suspend<RelationshipMutationResult, never, never>(() => {
    if (result.status === 'not-applied') return Effect.succeed(result);
    const runner = createContextualRunner<TError, TOptions>(configuration, options);
    const outcome = runner.createAppliedOutcome(command, result.delta);
    recordAppliedMutationOutcome(outcome);
    const reactions: AppliedRelationshipMutationResult['reactions'] = [];
    const applied: AppliedRelationshipMutationResult = {
      status: 'applied',
      outcome,
      reactions,
    };
    const process = async () => {
      const processed = await runner.react(outcome);
      recordAppliedReactionOutcomes(processed);
      reactions.push(...processed.reactions);
    };

    return deferDataGraphPostCommitWork(process)
      ? Effect.succeed(applied)
      : Effect.promise(process).pipe(Effect.as(applied));
  });

export const createContextualMutationReactionExecutor = <TError = unknown, TOptions = undefined>({
  getReactions,
  invokeOperation,
  emitEvent,
  createOutcomeId = createDefaultOutcomeId,
  maxDepth,
}: ContextualMutationReactionExecutorOptions): RelationshipCommandExecutor<
  TError,
  TOptions,
  RelationshipMutationResult
> => {
  const configuration = { getReactions, invokeOperation, emitEvent, createOutcomeId, maxDepth };

  return {
    runRelationshipCommand: (command, options) =>
      Effect.suspend(() => {
        const runtime =
          getRequiredDataGraphRuntime<
            Partial<RelationshipCommandExecutor<TError, TOptions, RelationshipCommandResult>>
          >();
        if (typeof runtime.runRelationshipCommand !== 'function') {
          throw new TypeError(
            'The current Data Graph runtime does not support direct Relationship Command execution.',
          );
        }
        return runtime
          .runRelationshipCommand(command, options)
          .pipe(
            Effect.flatMap(result =>
              applyContextualRelationshipMutationReactions(command, result, options, configuration),
            ),
          );
      }),
    runManyToManyRelationshipCommand: (command, options) =>
      Effect.suspend(() => {
        const runtime =
          getRequiredDataGraphRuntime<
            Partial<RelationshipCommandExecutor<TError, TOptions, RelationshipCommandResult>>
          >();
        if (typeof runtime.runManyToManyRelationshipCommand !== 'function') {
          throw new TypeError(
            'The current Data Graph runtime does not support many-to-many Relationship Command execution.',
          );
        }
        return runtime
          .runManyToManyRelationshipCommand(command, options)
          .pipe(
            Effect.flatMap(result =>
              applyContextualRelationshipMutationReactions(command, result, options, configuration),
            ),
          );
      }),
    runOrderedRelationshipCommand: (command, options) =>
      Effect.suspend(() => {
        const runtime =
          getRequiredDataGraphRuntime<
            Partial<RelationshipCommandExecutor<TError, TOptions, RelationshipCommandResult>>
          >();
        if (typeof runtime.runOrderedRelationshipCommand !== 'function') {
          throw new TypeError(
            'The current Data Graph runtime does not support ordered Relationship Command execution.',
          );
        }
        return runtime
          .runOrderedRelationshipCommand(command, options)
          .pipe(
            Effect.flatMap(result =>
              applyContextualRelationshipMutationReactions(command, result, options, configuration),
            ),
          );
      }),
  };
};
