import { field, graphSchema, mapRelation, type RelationConstraint } from '@ontahi/core/data-graph';
import { entity, relation, relationConstraint } from '@ontahi/core/entity';
import { failOperation, type OntahiCapabilities } from '@ontahi/core/runtime/server';
import { Effect } from 'effect';

import { todoAuthenticationMode } from './authentication-mode.js';
import {
  CompleteAllOutput,
  CompleteAllProgress,
  createRunCompleteAll,
} from './complete-all-task.js';

const entityDefaults = {
  authority: 'server',
  exposure: 'bridge',
  layer: 'todos',
} as const;

export type TodoCapabilities = OntahiCapabilities & {
  runtime: {
    notifications: {
      todoListCreated(input: { listId: string; name: string }): Effect.Effect<void>;
    };
  };
};

export const TodoList = entity({
  name: 'TodoList',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({
      trim: true,
      exclude: {
        values: ['archive'],
        caseInsensitive: true,
      },
      messages: {
        exclude: 'Archive is reserved for system use.',
      },
    }),
  },
  domainOperationDefaults: entityDefaults,
  uses: {
    capabilities: {} as TodoCapabilities,
  },
  operations: ({ self, commands, operation, app }) => ({
    create: operation({
      input: graphSchema.pick(self, ['id', 'name']).named('CreateTodoListInput'),
      output: self,
      bridge: { invalidate: [['TodoList']] },
      run: input =>
        Effect.gen(function* () {
          const created = yield* commands.insertReturning(input, ['id', 'name']).run();

          yield* app.runtime.notifications.todoListCreated({
            listId: created.id,
            name: created.name,
          });

          return created;
        }),
    }),
    rename: operation({
      input: graphSchema.object({
        list: self.one(),
        name: self.fields.name,
      }),
      output: self,
      bridge: { invalidate: [['TodoList']] },
      run: ({ list, name }) => list.updateReturning({ name }, ['id', 'name']),
    }),
    delete: operation({
      input: graphSchema.object({
        list: self.one(),
      }),
      bridge: { invalidate: [['TodoList']] },
      run: ({ list }) => list.delete(),
    }),
  }),
});

const todoItemFields = {
  id: field.id(),
  list: field.ref(TodoList),
  title: field.nonEmptyString({ trim: true }),
  completed: field.boolean(),
};

export const Tag = entity({
  name: 'Tag',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
    color: field.nonEmptyString({ trim: true }),
  },
  domainOperationDefaults: entityDefaults,
  operations: ({ self, commands, operation }) => ({
    create: operation({
      input: graphSchema.pick(self, ['id', 'name', 'color']).named('CreateTagInput'),
      output: self,
      bridge: { invalidate: [['Tag']] },
      run: input => commands.insertReturning(input, ['id', 'name', 'color']),
    }),
  }),
});

export const TodoItem = entity({
  name: 'TodoItem',
  fields: todoItemFields,
  relations: {
    tags: relation.manyToMany(Tag, {
      constraints: (): readonly RelationConstraint[] => [
        relationConstraint.source(TodoItem, todo => todo.completed.eq(false), {
          code: 'completed_todo_cannot_be_tagged',
          message: 'Completed todos cannot be tagged.',
        }),
      ],
    }),
  },
  uses: {
    entities: () => ({ TodoList }),
  },
  domainOperationDefaults: entityDefaults,
  operations: ({ self, commands, operation, ingress, entities, app }) => {
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
      create: operation({
        input: graphSchema.pick(self, ['id', 'list', 'title']).named('CreateTodoItemInput'),
        output: self,
        bridge: { invalidate: [['TodoItem']] },
        run: ({ id, list, title }) =>
          Effect.gen(function* () {
            const lists = yield* entities.TodoList.where(list)
              .select(list => ({ id: list.id }))
              .run();

            if (lists.length === 0) {
              return yield* failOperation('todo_list_not_found', 'Todo list does not exist.', {
                list,
              });
            }

            return yield* commands
              .insertReturning({ id, list, title, completed: false }, [
                'id',
                'list',
                'title',
                'completed',
              ])
              .run();
          }),
      }),
      complete: operation({
        input: graphSchema.object({
          todos: self.many(),
        }),
        requires: todoAuthenticationMode === 'github' ? [app.require.authenticated()] : [],
        bridge: { invalidate: [['TodoItem']] },
        run: ({ todos }) => todos.update({ completed: true }),
      }),
      deleteAll: operation({
        bridge: { invalidate: [['TodoItem']] },
        run: () => commands.all().delete(),
      }),
      completeAll: operation({
        output: CompleteAllOutput,
        bridge: { invalidate: [['TodoItem']] },
        ingress: [
          ingress.http({
            method: 'POST',
            route: '/operations/TodoItem.completeAll',
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

mapRelation(TodoItem, 'tags', {
  type: 'many-to-many',
  from: 'todo_items.id',
  through: { table: 'todo_tags', fromColumn: 'todo_id', toColumn: 'tag_id' },
  to: 'tags.id',
});
