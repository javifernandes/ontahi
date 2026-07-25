import { field, graphSchema } from '@ontahi/core/data-graph';
import { entity } from '@ontahi/core/entity';
import { Effect } from 'effect';

import {
  CompleteAllOutput,
  CompleteAllProgress,
  createRunCompleteAll,
} from './complete-all-task.js';

export const Todo = entity({
  name: 'Todo',
  fields: {
    id: field.id(),
    title: field.nonEmptyString({ trim: true }),
    completed: field.boolean(),
  },
  locators: { refById: 'id' },
  identity: 'refById',
  domainOperationDefaults: {
    authority: 'server',
    exposure: 'bridge',
    layer: 'todos',
  },
  operations: ({ self, commands, operation, ingress }) => {
    const runCompleteAll = createRunCompleteAll(() =>
      commands
        .where(todo => todo.completed.eq(false))
        .updateReturning({ completed: true }, ['id'])
        .run()
        .pipe(
          Effect.orDie,
          Effect.map(completed => completed.length),
        ),
    );

    return {
      list: operation({
        output: graphSchema.array(self),
        bridge: { query: [() => 'all'] },
        run: () => commands.all().orderBy(todo => todo.title),
      }),
      create: operation({
        input: graphSchema.pick(self, ['id', 'title']).named('CreateTodoInput'),
        output: self,
        bridge: { invalidate: [['Todo']] },
        run: ({ id, title }) =>
          commands.insertReturning({ id, title, completed: false }, ['id', 'title', 'completed']),
      }),
      complete: operation({
        input: graphSchema.object({
          todos: graphSchema.selection(self, { cardinality: 'many' }),
        }),
        bridge: { invalidate: [['Todo']] },
        run: ({ todos }) => todos.update({ completed: true }),
      }),
      deleteAll: operation({
        bridge: { invalidate: [['Todo']] },
        run: () => commands.all().delete(),
      }),
      completeAll: operation({
        output: CompleteAllOutput,
        bridge: { invalidate: [['Todo']] },
        ingress: [
          ingress.http({
            method: 'POST',
            route: '/operations/Todo.completeAll',
            provider: 'express',
            channel: 'todo.complete-all',
          }),
        ],
        durable: {
          runtime: 'in-process',
          progress: CompleteAllProgress,
        },
        run: runCompleteAll,
      }),
    };
  },
});
