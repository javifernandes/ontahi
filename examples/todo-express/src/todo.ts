import {
  field,
  graphSchema,
  mapRelation,
  type InferGraphSchemaValue,
  type RelationConstraint,
} from '@ontahi/core/data-graph';
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

const todoListFields = {
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
  color: field.named('Color', field.nonEmptyString({ trim: true })),
};

const TodoItemCommandRef = entity.ref('TodoItem', {
  fields: {
    id: field.id(),
    list: field.ref(entity.ref('TodoList')),
    completed: field.boolean(),
  },
});

export const TodoList = entity({
  name: 'TodoList',
  fields: todoListFields,
  display: { primary: 'name', search: ['name'] },
  domainOperationDefaults: entityDefaults,
  uses: {
    capabilities: {} as TodoCapabilities,
  },
  operations: ({ self, commands, commandsFor, operation, ingress, app }) => {
    const todoCommands = commandsFor(TodoItemCommandRef);
    const CompleteAllInput = graphSchema.object({
      list: graphSchema.ref(self),
    });
    const runCompleteAll = createRunCompleteAll<InferGraphSchemaValue<typeof CompleteAllInput>>(
      ({ list }) =>
        todoCommands
          .where(todo => todo.list.eq(list))
          .where(todo => todo.completed.eq(false))
          .updateReturning({ completed: true }, ['id'])
          .run()
          .pipe(
            Effect.orDie,
            Effect.map(completed => completed.length),
          ),
    );

    return {
      createList: operation({
        input: graphSchema.pick(self, ['id', 'name', 'color']).named('CreateTodoListInput'),
        output: self,
        bridge: { invalidate: [['TodoList']] },
        run: input =>
          Effect.gen(function* () {
            const created = yield* commands.insertReturning(input, ['id', 'name', 'color']).run();

            yield* app.runtime.notifications.todoListCreated({
              listId: created.id,
              name: created.name,
            });

            return created;
          }),
      }),
      completeAll: operation({
        input: graphSchema.object({
          list: graphSchema.ref(self),
        }),
        graphOps: { receiver: 'list' },
        output: CompleteAllOutput,
        bridge: { invalidate: [['TodoItem']] },
        ingress: [
          ingress.http({
            method: 'POST',
            route: '/operations/TodoList.completeAll',
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

export const Tag = entity({
  name: 'Tag',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
    color: TodoList.fields.color,
  },
  display: { primary: 'name', search: ['name'] },
});

const todoItemFields = {
  id: field.id(),
  list: field.ref(TodoList),
  title: field.nonEmptyString({ trim: true }),
  completed: field.boolean(),
};

export const TodoItem = entity({
  name: 'TodoItem',
  fields: todoItemFields,
  display: { primary: 'title', search: ['title'] },
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
  operations: ({ self, commands, commandsFor, operation, app }) => {
    const todoEntities = app.graph.defineEntity(self);
    const tagEntities = app.graph.defineEntity(Tag);
    const tagCommands = commandsFor(Tag);
    const listCommands = commandsFor(TodoList);
    const unlinkTodoTags = (todoId: string) =>
      Effect.gen(function* () {
        const tags = yield* tagEntities
          .relatedTo(
            todoEntities.selection(candidate => candidate.id.eq(todoId)),
            {
              through: 'tags',
            },
          )
          .run();
        for (const tag of tags) {
          yield* todoEntities.refById(todoId).tags.remove(tagEntities.refById(tag.id)).run();
        }
      });
    return {
      createItem: operation({
        input: graphSchema.pick(self, ['id', 'list', 'title']).named('CreateTodoItemInput'),
        output: self,
        bridge: { invalidate: [['TodoItem']] },
        run: ({ id, list, title }) =>
          Effect.gen(function* () {
            const existingList = yield* list.resolve();

            if (!existingList) {
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
      setCompleted: operation({
        input: graphSchema.object({
          todos: self.many(),
          completed: self.fields.completed,
        }),
        graphOps: { receiver: 'todos' },
        requires: todoAuthenticationMode === 'github' ? [app.require.authenticated()] : [],
        bridge: { invalidate: [['TodoItem']] },
        run: ({ todos, completed }) => todos.update({ completed }),
      }),
      delete: operation({
        input: graphSchema.object({
          todo: graphSchema.existingRef(self),
        }),
        graphOps: { receiver: 'todo' },
        bridge: { invalidate: [['TodoItem']] },
        *run({ todo }) {
          yield* unlinkTodoTags(todo.id);
          yield* commands
            .where(candidate => candidate.id.eq(todo.id))
            .delete()
            .run();
        },
      }),
      deleteList: operation.atomic({
        input: graphSchema.object({
          list: graphSchema.existingRef(TodoList),
        }),
        graphOps: { receiver: 'list' },
        bridge: { invalidate: [['TodoList'], ['TodoItem'], ['Tag']] },
        *run({ list }) {
          const todos = yield* todoEntities.where(todo => todo.list.eq(list.ref)).run();
          for (const todo of todos) yield* unlinkTodoTags(todo.id);
          yield* commands
            .where(todo => todo.list.eq(list.ref))
            .delete()
            .run();
          yield* listCommands
            .where(candidate => candidate.id.eq(list.id))
            .delete()
            .run();
        },
      }),
      deleteTag: operation({
        input: graphSchema.object({
          tag: graphSchema.existingRef(Tag),
        }),
        graphOps: { receiver: 'tag' },
        bridge: { invalidate: [['Tag'], ['TodoItem']] },
        *run({ tag }) {
          const todos = yield* todoEntities
            .relatedTo(
              tagEntities.selection(candidate => candidate.id.eq(tag.id)),
              {
                through: 'tags',
              },
            )
            .run();
          for (const todo of todos) {
            yield* todoEntities.refById(todo.id).tags.remove(tag.ref).run();
          }
          yield* tagCommands
            .where(candidate => candidate.id.eq(tag.id))
            .delete()
            .run();
        },
      }),
      deleteAll: operation({
        bridge: { invalidate: [['TodoItem']] },
        run: () => commands.all().delete(),
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
