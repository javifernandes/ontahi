import { field, value } from '@ontahi/core/data-graph';
import type { TaskContext } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';

import { app } from './architecture.js';
import { TodoEntity } from './todo-schema.js';

export const CompleteAllProgress = value('CompleteAllProgress', {
  phase: field.enum(['updating'] as const),
});
export const CompleteAllOutput = value('CompleteAllOutput', {
  completed: field.nonNegativeInteger(),
});
const TodoCommands = app.graph.defineEntity(TodoEntity);

export const runCompleteAll = (_input: {}, context?: TaskContext) => {
  const reportProgress = context
    ? context.progress({ phase: 'updating' }).pipe(Effect.orDie, Effect.asVoid)
    : Effect.void;
  const demonstrateDurableProgress = context
    ? context.sleep(1_000).pipe(Effect.orDie)
    : Effect.void;

  return Effect.gen(function* () {
    yield* reportProgress;
    yield* demonstrateDurableProgress;
    const completed = yield* TodoCommands.where(todo => todo.completed.eq(false))
      .updateReturning({ completed: true }, ['id'])
      .run()
      .pipe(Effect.orDie);
    return { completed: completed.length };
  });
};
