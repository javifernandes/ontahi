import { Effect } from 'effect';

import {
  createMutationReactionRunner,
  type AppliedRelationshipMutationResult,
  type InvokeOperationReactionIntent,
  type MutationReaction,
  type RelationshipMutationResult,
} from '../../data-graph/mutation-reaction.js';
import type { RelationshipCommandResult } from '../../data-graph/relationship-command-result.js';
import type {
  ManyToManyRelationshipCommand,
  RelationshipCommand,
  RelationshipCommandExecutor,
  RelationshipDelta,
} from '../../data-graph/relationship-command.js';

import { deferDataGraphPostCommitWork, getRequiredDataGraphRuntime } from './data-graph.js';

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
  const applyReactions = (
    command: RelationshipCommand | ManyToManyRelationshipCommand,
    delta: RelationshipDelta,
    options?: TOptions,
  ) => {
    const runner = createMutationReactionRunner({
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
      invokeOperation,
      emitEvent,
      createOutcomeId,
      ...(maxDepth === undefined ? {} : { maxDepth }),
    });
    const outcome = runner.createAppliedOutcome(command, delta);
    const reactions: AppliedRelationshipMutationResult['reactions'] = [];
    const result: AppliedRelationshipMutationResult = {
      status: 'applied',
      outcome,
      reactions,
    };
    const process = async () => {
      const processed = await runner.react(outcome);
      reactions.push(...processed.reactions);
    };

    return deferDataGraphPostCommitWork(process)
      ? Effect.succeed(result)
      : Effect.promise(process).pipe(Effect.as(result));
  };

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
              result.status === 'not-applied'
                ? Effect.succeed<RelationshipMutationResult>(result)
                : applyReactions(command, result.delta, options).pipe(
                    Effect.map(applied => applied as RelationshipMutationResult),
                  ),
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
              result.status === 'not-applied'
                ? Effect.succeed<RelationshipMutationResult>(result)
                : applyReactions(command, result.delta, options).pipe(
                    Effect.map(applied => applied as RelationshipMutationResult),
                  ),
            ),
          );
      }),
  };
};
