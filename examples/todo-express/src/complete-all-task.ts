import { field, value } from '@ontahi/core/data-graph';
import type { TaskContext } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';

export const CompleteAllProgress = value('CompleteAllProgress', {
  phase: field.enum(['updating'] as const),
});
export const CompleteAllOutput = value('CompleteAllOutput', {
  completed: field.nonNegativeInteger(),
});

export const createRunCompleteAll =
  <TInput>(completeTodos: (input: TInput) => Effect.Effect<number>) =>
  (input: TInput, context?: TaskContext) => {
    const reportProgress = context
      ? context.progress({ phase: 'updating' }).pipe(Effect.orDie, Effect.asVoid)
      : Effect.void;
    const demonstrateDurableProgress = context
      ? context.sleep(1_000).pipe(Effect.orDie)
      : Effect.void;

    return Effect.gen(function* () {
      yield* reportProgress;
      yield* demonstrateDurableProgress;
      return { completed: yield* completeTodos(input) };
    });
  };
