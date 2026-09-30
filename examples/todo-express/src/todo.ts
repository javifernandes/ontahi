import {
  createEntityRef,
  field,
  graphSchema,
  mapRelation,
  mutateEntity,
  toGraphCommandRequest,
  value,
  withSelectionFactories,
  type EntityMutationCommandExecutionRuntime,
  type InferGraphSchemaValue,
  type RelationConstraint,
} from '@ontahi/core/data-graph';
import { entity, relation, relationConstraint } from '@ontahi/core/entity';
import {
  defineTaskExecution,
  defineTaskExecutionStep,
  failOperation,
  getRequiredDataGraphRuntime,
  type TaskExecutionState,
} from '@ontahi/core/runtime/server';
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

export type TodoEvent = {
  type: 'TodoListCreated';
  listId: string;
  name: string;
};

const todoListFields = {
  id: field.generated(field.id(), 'uuid'),
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
  color: field.default(field.named('Color', field.nonEmptyString({ trim: true })), '#f5ddd5'),
};

const TodoItemCommandRef = entity.ref('TodoItem', {
  fields: {
    id: field.id(),
    list: field.existingRef(entity.ref('TodoList')),
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
      onDelete: 'cascade',
    }),
  },
  selections: ({ self }) => ({
    openItems: self.items.where(item => item.completed.eq(false)),
  }),
  display: { primary: 'name', search: ['name'] },
  reactions: ({ created }) => [
    created({ id: 'notify-todo-list-created', delivery: 'best-effort' }).emit(
      outcome =>
        ({
          type: 'TodoListCreated',
          listId: String(outcome.command.values.id),
          name: String(outcome.command.values.name),
        }) satisfies TodoEvent,
    ),
  ],
  domainOperationDefaults: entityDefaults,
  operations: ({ self, commandsFor, operation, ingress }) => {
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
      color: field.named('Color', field.nonEmptyString({ trim: true })),
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
  id: field.generated(field.id(), 'uuid'),
  list: field.existingRef(TodoList),
  title: field.nonEmptyString({ trim: true }),
  completed: field.default(field.boolean(), false),
};

export const DeleteListItemsOutput = value('DeleteListItemsOutput', {
  deleted: field.nonNegativeInteger(),
  rejected: field.boolean(),
});

type DeleteListItemsInput = { readonly listName: string };
type DeleteListItemsResult = InferGraphSchemaValue<typeof DeleteListItemsOutput>;
type DeleteListCandidate = { readonly id: string; readonly name: string };
type DeleteListItemsState = TaskExecutionState &
  (
    | { readonly step: 'resolve-list'; readonly listName: string }
    | {
        readonly step: 'choose-list';
        readonly listName: string;
        readonly candidates: readonly DeleteListCandidate[];
      }
    | { readonly step: 'build-proposal'; readonly selected: DeleteListCandidate }
    | {
        readonly step: 'approve-proposal' | 'execute-proposal';
        readonly selected: DeleteListCandidate;
        readonly requests: readonly JsonValue[];
        readonly todoCount: number;
      }
  );

export const TodoItem = entity({
  name: 'TodoItem',
  fields: todoItemFields,
  display: { primary: 'title', search: ['title'] },
  relations: {
    tags: relation.manyToMany(Tag, {
      onDelete: 'detach',
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
    const listCommands = commandsFor(TodoList);
    const createDeleteProposal = (selected: DeleteListCandidate) =>
      Effect.gen(function* () {
        const todos = [
          ...(yield* todoEntities
            .where(todo => todo.list.eq(createEntityRef(TodoList, { id: selected.id })))
            .run()),
        ].sort((left, right) => left.id.localeCompare(right.id));
        const effects: Array<{ request: JsonValue; run(): Effect.Effect<unknown, unknown> }> = [];

        for (const todo of todos) {
          const selection = commands
            .where(candidate => candidate.id.eq(todo.id))
            .where(candidate => candidate.list.eq(todo.list))
            .where(candidate => candidate.title.eq(todo.title))
            .where(candidate => candidate.completed.eq(todo.completed))
            .delete();
          const command = mutateEntity(self).deleteSelection({
            kind: 'selection',
            entityName: self.name,
            expression: selection.build().selection,
          });
          effects.push({
            request: toGraphCommandRequest(command) as unknown as JsonValue,
            run: () =>
              getRequiredDataGraphRuntime<
                EntityMutationCommandExecutionRuntime<unknown>
              >().runEntityMutationCommand(command),
          });
        }

        return {
          effects,
          requests: effects.map(effect => effect.request),
          todoCount: todos.length,
        };
      });
    const deleteFromNamedListExecution = defineTaskExecution<
      DeleteListItemsInput,
      DeleteListItemsState,
      DeleteListItemsResult
    >({
      initial: ({ listName }) => ({ step: 'resolve-list', listName }),
      steps: {
        'resolve-list': defineTaskExecutionStep({
          run: ({ state }) =>
            Effect.gen(function* () {
              if (state.step !== 'resolve-list') return yield* Effect.dieMessage('Invalid state.');
              const candidates = [
                ...(yield* listCommands.where(list => list.name.eq(state.listName)).run()),
              ]
                .map(({ id, name }) => ({ id, name }))
                .sort((left, right) => left.id.localeCompare(right.id));
              if (candidates.length === 0) {
                return yield* failOperation('todo_list_not_found', 'Todo list does not exist.', {
                  listName: state.listName,
                });
              }
              return {
                kind: 'continue',
                state:
                  candidates.length === 1
                    ? { step: 'build-proposal', selected: candidates[0]! }
                    : { step: 'choose-list', listName: state.listName, candidates },
              };
            }),
        }),
        'choose-list': defineTaskExecutionStep({
          run: ({ state, response }) => {
            if (state.step !== 'choose-list') return Effect.dieMessage('Invalid state.');
            if (!response) {
              return Effect.succeed({
                kind: 'interaction',
                state,
                interaction: {
                  id: 'choose-list',
                  prompt: `Which “${state.listName}” list should be emptied?`,
                  options: state.candidates.map(list => ({
                    id: list.id,
                    label: `${list.name} (${list.id})`,
                    value: list,
                  })),
                },
              });
            }
            if (!('optionId' in response)) return Effect.dieMessage('Invalid choice response.');
            const selected = state.candidates.find(candidate => candidate.id === response.optionId);
            return selected
              ? Effect.succeed({ kind: 'continue', state: { step: 'build-proposal', selected } })
              : Effect.dieMessage('Unknown list choice.');
          },
        }),
        'build-proposal': defineTaskExecutionStep({
          run: ({ state }) =>
            Effect.gen(function* () {
              if (state.step !== 'build-proposal')
                return yield* Effect.dieMessage('Invalid state.');
              const proposal = yield* createDeleteProposal(state.selected);
              return proposal.todoCount === 0
                ? { kind: 'complete', result: { deleted: 0, rejected: false } }
                : {
                    kind: 'continue',
                    state: {
                      step: 'approve-proposal',
                      selected: state.selected,
                      requests: proposal.requests,
                      todoCount: proposal.todoCount,
                    },
                  };
            }),
        }),
        'approve-proposal': defineTaskExecutionStep({
          run: ({ state, response, context }) => {
            if (state.step !== 'approve-proposal') return Effect.dieMessage('Invalid state.');
            if (!response) {
              return Effect.succeed({
                kind: 'interaction',
                state,
                interaction: {
                  id: 'approve-delete-items',
                  prompt: `Delete ${state.todoCount} item${state.todoCount === 1 ? '' : 's'} from “${state.selected.name}”?`,
                  proposal: {
                    id: `${context.runId}:delete-items:${state.selected.id}`,
                    summary: `Delete ${state.todoCount} item${state.todoCount === 1 ? '' : 's'} from “${state.selected.name}”.`,
                    requests: state.requests,
                  },
                },
              });
            }
            if (!('decision' in response)) return Effect.dieMessage('Invalid approval response.');
            return Effect.succeed(
              response.decision === 'reject'
                ? { kind: 'complete', result: { deleted: 0, rejected: true } }
                : { kind: 'continue', state: { ...state, step: 'execute-proposal' } },
            );
          },
        }),
        'execute-proposal': defineTaskExecutionStep({
          run: ({ state }) =>
            Effect.gen(function* () {
              if (state.step !== 'execute-proposal')
                return yield* Effect.dieMessage('Invalid state.');
              const current = yield* createDeleteProposal(state.selected);
              if (JSON.stringify(current.requests) !== JSON.stringify(state.requests)) {
                return yield* failOperation(
                  'todo_delete_proposal_stale',
                  'The list changed after approval was requested. No items were deleted.',
                  { listId: state.selected.id },
                );
              }
              for (const effect of current.effects) yield* effect.run().pipe(Effect.orDie);
              return {
                kind: 'complete',
                result: { deleted: current.todoCount, rejected: false },
              };
            }),
        }),
      },
    });
    return {
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
          execution: deleteFromNamedListExecution,
          ...(todoAuthenticationMode === 'disabled'
            ? { trigger: { cause: 'system' as const, actor: { kind: 'system' as const } } }
            : {}),
        },
        run: (): Effect.Effect<DeleteListItemsResult> =>
          Effect.dieMessage('Explicit durable execution requires a Task Runtime.'),
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
