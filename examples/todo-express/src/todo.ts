import { field, graphSchema } from '@ontahi/core/data-graph';
import { entity, relation } from '@ontahi/core/entity';
import { failOperation, type OntahiCapabilities } from '@ontahi/core/runtime/server';
import { Effect } from 'effect';

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

const todoFields = {
  id: field.id(),
  listId: field.id(),
  title: field.nonEmptyString({ trim: true }),
  completed: field.boolean(),
};

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
  locators: { refById: 'id' },
  identity: 'refById',
  domainOperationDefaults: entityDefaults,
  uses: {
    capabilities: {} as TodoCapabilities,
  },
  operations: ({ self, commands, operation, app }) => ({
    list: operation({
      output: graphSchema.array(self),
      bridge: { query: [() => 'all'] },
      run: () => commands.all().orderBy(list => list.name),
    }),
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
        list: graphSchema.selection(self, { cardinality: 'one' }),
        name: self.fields.name,
      }),
      output: self,
      bridge: { invalidate: [['TodoList']] },
      run: ({ list, name }) => commands.where(list).updateOneReturning({ name }, ['id', 'name']),
    }),
    delete: operation({
      input: graphSchema.object({
        list: graphSchema.selection(self, { cardinality: 'one' }),
      }),
      bridge: { invalidate: [['TodoList']] },
      run: ({ list }) => commands.where(list).deleteOne(),
    }),
  }),
});

export const Tag = entity({
  name: 'Tag',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
    color: field.nonEmptyString({ trim: true }),
  },
  locators: { refById: 'id' },
  identity: 'refById',
  domainOperationDefaults: entityDefaults,
  operations: ({ self, commands, operation }) => ({
    list: operation({
      output: graphSchema.array(self),
      bridge: { query: [() => 'all'] },
      run: () => commands.all().orderBy(tag => tag.name),
    }),
    create: operation({
      input: graphSchema.pick(self, ['id', 'name', 'color']).named('CreateTagInput'),
      output: self,
      bridge: { invalidate: [['Tag']] },
      run: input => commands.insertReturning(input, ['id', 'name', 'color']),
    }),
  }),
});

export const TodoTag = entity({
  name: 'TodoTag',
  fields: {
    todoId: field.id(),
    tagId: field.id(),
  },
  locators: { refByTodoAndTag: ['todoId', 'tagId'] },
  identity: 'refByTodoAndTag',
  relations: {
    tag: relation.belongsTo(Tag, { via: 'tagId' }),
  },
  domainOperationDefaults: entityDefaults,
  operations: ({ self, commands, operation }) => ({
    list: operation({
      output: graphSchema.array(self),
      bridge: { query: [() => 'all'] },
      run: () => commands.all().orderBy(assignment => assignment.todoId),
    }),
    remove: operation({
      input: graphSchema.object({
        assignment: graphSchema.selection(self, { cardinality: 'one' }),
      }),
      bridge: { invalidate: [['TodoTag']] },
      run: ({ assignment }) => commands.where(assignment).deleteOne(),
    }),
  }),
});

export const Todo = entity({
  name: 'Todo',
  fields: todoFields,
  locators: { refById: 'id' },
  identity: 'refById',
  relations: {
    list: relation.belongsTo(TodoList, { via: 'listId' }),
    tagAssignments: relation.hasMany(TodoTag, { via: 'todoId' }),
  },
  uses: {
    entities: () => ({ TodoList, Tag, TodoTag }),
  },
  domainOperationDefaults: entityDefaults,
  operations: ({ self, commands, operation, ingress, entities }) => {
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
        input: graphSchema.selection(self, { cardinality: 'many' }),
        output: graphSchema.array(self),
        bridge: { query: [(todos: unknown) => todos] },
        run: todos => commands.where(todos).orderBy(todo => todo.title),
      }),
      listForList: operation({
        input: graphSchema.object({
          list: graphSchema.selection(TodoList, { cardinality: 'one' }),
        }),
        output: graphSchema.array(self),
        bridge: { query: [(input: unknown) => input] },
        run: ({ list }) =>
          commands
            .relatedTo(entities.TodoList.where(list), { through: 'list' })
            .orderBy(todo => todo.title),
      }),
      create: operation({
        input: graphSchema.pick(self, ['id', 'listId', 'title']).named('CreateTodoInput'),
        output: self,
        bridge: { invalidate: [['Todo']] },
        run: ({ id, listId, title }) =>
          Effect.gen(function* () {
            const lists = yield* entities.TodoList.where(list => list.id.eq(listId))
              .select(list => ({ id: list.id }))
              .run();

            if (lists.length === 0) {
              return yield* failOperation('todo_list_not_found', 'Todo list does not exist.', {
                listId,
              });
            }

            return yield* commands
              .insertReturning({ id, listId, title, completed: false }, [
                'id',
                'listId',
                'title',
                'completed',
              ])
              .run();
          }),
      }),
      complete: operation({
        input: graphSchema.object({
          todos: graphSchema.selection(self, { cardinality: 'many' }),
        }),
        bridge: { invalidate: [['Todo']] },
        run: ({ todos }) => todos.update({ completed: true }),
      }),
      deleteAll: operation({
        bridge: { invalidate: [['Todo'], ['TodoTag']] },
        run: () =>
          Effect.gen(function* () {
            yield* entities.TodoTag.all().delete().run();
            yield* commands.all().delete().run();
          }),
      }),
      assignTags: operation({
        input: graphSchema.object({
          todos: graphSchema.selection(self, { cardinality: 'many' }),
          tagIds: graphSchema.array(field.id()),
        }),
        bridge: { invalidate: [['TodoTag']] },
        run: ({ todos, tagIds }) =>
          Effect.gen(function* () {
            const uniqueTagIds = [...new Set(tagIds)];
            if (uniqueTagIds.length === 0) return;

            const existingTags = yield* entities.Tag.where(tag => tag.id.in(uniqueTagIds))
              .select(tag => ({ id: tag.id }))
              .run();
            const existingTagIds = new Set(existingTags.map(tag => tag.id));
            const missingTagIds = uniqueTagIds.filter(tagId => !existingTagIds.has(tagId));

            if (missingTagIds.length > 0) {
              return yield* failOperation('tags_not_found', 'One or more tags do not exist.', {
                tagIds: missingTagIds,
              });
            }

            const selectedTodos = yield* commands
              .where(todos)
              .select(todo => ({ id: todo.id }))
              .run();
            const assignments = selectedTodos.flatMap(todo =>
              uniqueTagIds.map(tagId => ({ todoId: todo.id, tagId })),
            );

            if (assignments.length === 0) return;

            yield* entities.TodoTag.upsertMany(assignments, {
              conflictOn: ['todoId', 'tagId'],
              strategy: 'ignore',
            }).run();
          }),
      }),
      removeTags: operation({
        input: graphSchema.object({
          todos: graphSchema.selection(self, { cardinality: 'many' }),
          tagIds: graphSchema.array(field.id()),
        }),
        bridge: { invalidate: [['TodoTag']] },
        run: ({ todos, tagIds }) =>
          Effect.gen(function* () {
            const selectedTodos = yield* commands
              .where(todos)
              .select(todo => ({ id: todo.id }))
              .run();

            yield* entities.TodoTag.where(assignment =>
              assignment.todoId.in(selectedTodos.map(todo => todo.id)),
            )
              .where(assignment => assignment.tagId.in(tagIds))
              .delete()
              .run();
          }),
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
