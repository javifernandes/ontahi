import {
  createEntityRef,
  field,
  graphSchema,
  mapRelation,
  mutateEntity,
  toGraphCommandRequest,
  value,
  withSelectionFactories,
  type InferGraphSchemaValue,
  type RelationConstraint,
} from '@ontahi/core/data-graph';
import { entity, relation, relationConstraint } from '@ontahi/core/entity';
import { failOperation, type OntahiCapabilities } from '@ontahi/core/runtime/server';
import type { JsonValue } from '@ontahi/core/value/json';
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
  relations: {
    items: relation.hasMany(entity.ref('TodoItem', { fields: { completed: field.boolean() } }), {
      via: 'list',
      ordered: true,
    }),
  },
  selections: ({ self }) => ({
    openItems: self.items.where(item => item.completed.eq(false)),
  }),
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
        description: 'Create a new list.',
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
        bridge: { invalidate: [['TodoList'], ['TodoItem']] },
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

export const Tag = withSelectionFactories(
  entity({
    name: 'Tag',
    fields: {
      id: field.id(),
      name: field.nonEmptyString({ trim: true }),
      color: TodoList.fields.color,
    },
    display: { primary: 'name', search: ['name'] },
  }),
  {
    identity: {
      version: 1,
      input: graphSchema.object({ id: field.id() }),
      scalarInput: 'id',
      template: { kind: 'identity', bindings: { id: 'id' } },
    },
    named: {
      version: 1,
      input: graphSchema.object({ text: field.nonEmptyString({ trim: true }) }),
      scalarInput: 'text',
      template: { kind: 'predicate', fieldName: 'name', operator: 'eq', input: 'text' },
    },
  },
);

const todoItemFields = {
  id: field.id(),
  list: field.ref(TodoList),
  title: field.nonEmptyString({ trim: true }),
  completed: field.boolean(),
};

export const DeleteListItemsOutput = value('DeleteListItemsOutput', {
  deleted: field.nonNegativeInteger(),
  rejected: field.boolean(),
});

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
  selections: ({ self }) => ({ labels: self.tags }),
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
        description: 'Add an item to a list.',
        input: graphSchema.pick(self, ['id', 'list', 'title']).named('CreateTodoItemInput'),
        output: self,
        bridge: { invalidate: [['TodoList'], ['TodoItem']] },
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
        description: 'Mark existing items completed or incomplete.',
        input: graphSchema.object({
          todos: self.many(),
          completed: self.fields.completed,
        }),
        graphOps: { receiver: 'todos' },
        requires: todoAuthenticationMode === 'github' ? [app.require.authenticated()] : [],
        bridge: { invalidate: [['TodoList'], ['TodoItem']] },
        run: ({ todos, completed }) => todos.update({ completed }),
      }),
      delete: operation({
        input: graphSchema.object({
          todo: graphSchema.existingRef(self),
        }),
        graphOps: { receiver: 'todo' },
        bridge: { invalidate: [['TodoList'], ['TodoItem']] },
        *run({ todo }) {
          yield* unlinkTodoTags(todo.id);
          yield* commands
            .where(candidate => candidate.id.eq(todo.id))
            .delete()
            .run();
        },
      }),
      deleteFromNamedList: operation({
        description:
          'Delete every item from one named list after resolving ambiguity and approval.',
        input: graphSchema.object({
          listName: TodoList.fields.name,
        }),
        output: DeleteListItemsOutput,
        bridge: { invalidate: [['TodoList'], ['TodoItem'], ['Tag']] },
        requires: todoAuthenticationMode === 'github' ? [app.require.authenticated()] : [],
        durable: {
          runtime: 'in-process',
          ...(todoAuthenticationMode === 'disabled'
            ? { trigger: { cause: 'system' as const, actor: { kind: 'system' as const } } }
            : {}),
        },
        run: ({ listName }, context) =>
          Effect.gen(function* () {
            if (!context) return yield* Effect.dieMessage('Durable Task context is required.');
            const candidates = [
              ...(yield* listCommands.where(list => list.name.eq(listName)).run()),
            ].sort((left, right) => left.id.localeCompare(right.id));

            if (candidates.length === 0) {
              return yield* failOperation('todo_list_not_found', 'Todo list does not exist.', {
                listName,
              });
            }

            const selected =
              candidates.length === 1
                ? candidates[0]!
                : yield* context.interact.choice({
                    id: 'choose-list',
                    prompt: `Which “${listName}” list should be emptied?`,
                    options: candidates.map(list => ({
                      id: list.id,
                      label: `${list.name} (${list.id})`,
                      value: list,
                    })),
                  });

            const createProposal = () =>
              Effect.gen(function* () {
                const todos = [
                  ...(yield* todoEntities
                    .where(todo => todo.list.eq(createEntityRef(TodoList, { id: selected.id })))
                    .run()),
                ].sort((left, right) => left.id.localeCompare(right.id));
                const proposedEffects: Array<{
                  request: JsonValue;
                  run(): Effect.Effect<unknown, unknown>;
                }> = [];

                for (const todo of todos) {
                  const tags = [
                    ...(yield* tagEntities
                      .relatedTo(
                        todoEntities.selection(candidate => candidate.id.eq(todo.id)),
                        { through: 'tags' },
                      )
                      .run()),
                  ].sort((left, right) => left.id.localeCompare(right.id));
                  for (const tag of tags) {
                    const command = todoEntities
                      .refById(todo.id)
                      .tags.remove(tagEntities.refById(tag.id));
                    proposedEffects.push({
                      request: toGraphCommandRequest(command) as unknown as JsonValue,
                      run: () => command.run(),
                    });
                  }
                  const target = commands
                    .where(candidate => candidate.id.eq(todo.id))
                    .where(candidate => candidate.list.eq(todo.list))
                    .where(candidate => candidate.title.eq(todo.title))
                    .where(candidate => candidate.completed.eq(todo.completed));
                  const command = target.delete();
                  proposedEffects.push({
                    request: toGraphCommandRequest(
                      mutateEntity(self).deleteSelection({
                        kind: 'selection',
                        entityName: self.name,
                        expression: command.build().selection,
                      }),
                    ) as unknown as JsonValue,
                    run: () => command.run(),
                  });
                }

                return {
                  effects: proposedEffects,
                  requests: proposedEffects.map(effect => effect.request),
                  todoCount: todos.length,
                };
              });

            const proposal = yield* createProposal();
            if (proposal.todoCount === 0) return { deleted: 0, rejected: false };

            const approval = yield* context.interact.approval({
              id: 'approve-delete-items',
              prompt: `Delete ${proposal.todoCount} item${proposal.todoCount === 1 ? '' : 's'} from “${selected.name}”?`,
              proposal: {
                id: `${context.runId}:delete-items:${selected.id}`,
                summary: `Delete ${proposal.todoCount} item${proposal.todoCount === 1 ? '' : 's'} from “${selected.name}”.`,
                requests: proposal.requests,
              },
            });
            if (approval.decision === 'reject') return { deleted: 0, rejected: true };

            const current = yield* createProposal();
            if (JSON.stringify(current.requests) !== JSON.stringify(proposal.requests)) {
              return yield* failOperation(
                'todo_delete_proposal_stale',
                'The list changed after approval was requested. No items were deleted.',
                { listId: selected.id },
              );
            }

            for (const effect of current.effects) yield* effect.run().pipe(Effect.orDie);
            return { deleted: current.todoCount, rejected: false };
          }),
      }),
      deleteList: operation.atomic({
        description: 'Delete a list and all its items.',
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
        bridge: { invalidate: [['TodoList'], ['Tag'], ['TodoItem']] },
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
        bridge: { invalidate: [['TodoList'], ['TodoItem']] },
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
