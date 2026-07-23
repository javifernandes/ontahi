import { graphSchema } from '@ontahi/core/data-graph';

import { app } from './architecture.js';
import { CompleteAllOutput, CompleteAllProgress, runCompleteAll } from './complete-all-task.js';
import { TodoEntity } from './todo-schema.js';

const TodoCommands = app.graph.defineEntity(TodoEntity);

export const Todo = app.graph.defineEntity(TodoEntity, {
  domainOperationDefaults: {
    authority: 'server',
    exposure: 'bridge',
    layer: 'todos',
  },
  domainOperations: {
    list: app.operation.define({
      output: graphSchema.array(TodoEntity),
      bridge: { query: [() => 'all'] },
      run: () => TodoCommands.all().orderBy(todo => todo.title),
    }),
    create: app.operation.define({
      input: graphSchema.pick(TodoEntity, ['id', 'title']).named('CreateTodoInput'),
      output: TodoEntity,
      bridge: { invalidate: [['Todo']] },
      run: input =>
        TodoCommands.insertReturning({ id: input.id, title: input.title, completed: false }, [
          'id',
          'title',
          'completed',
        ]),
    }),
    complete: app.operation.define({
      input: graphSchema.object({
        todos: graphSchema.selection(TodoEntity, { cardinality: 'many' }),
      }),
      bridge: { invalidate: [['Todo']] },
      run: input => input.todos.update({ completed: true }),
    }),
    completeAll: app.operation.define({
      output: CompleteAllOutput,
      bridge: { invalidate: [['Todo']] },
      ingress: [
        app.ingress.http({
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
  },
});
