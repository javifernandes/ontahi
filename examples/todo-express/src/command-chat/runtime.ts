import { randomUUID } from 'node:crypto';

import { createEntityRef, Selection, type GraphReadDispatcher } from '@ontahi/core/data-graph';
import {
  createModelCommandRuntime,
  getCurrentInvocationContext,
  ModelInterpretationError,
  type OntahiApplication,
  type GraphCommandableOntahiApplication,
  type ModelProvider,
} from '@ontahi/core/runtime/server';

import { todoAuthenticationMode } from '../authentication-mode.js';
import { todoGraphCommandPolicies } from '../todo-command-policies.js';
import type { TodoGraphReadAuthority } from '../todo-read-policies.js';
import { TodoItem, TodoList } from '../todo.js';

import { todoCommandBindings, todoCommandInstructions } from './bindings.js';
import { createCommandContextReader } from './context.js';
import { todoCommandUpdates } from './updates.js';

// Application composition only; orchestration lives in the Ontahi runtime.
export const createTodoModelRuntime = ({
  application,
  read,
  provider,
}: {
  application: OntahiApplication;
  read: GraphReadDispatcher<TodoGraphReadAuthority>;
  provider: ModelProvider;
}) => {
  const contextFor = createCommandContextReader(read);
  const commandDispatcher = (
    application as unknown as GraphCommandableOntahiApplication
  ).createGraphCommandDispatcher<TodoGraphReadAuthority>(todoGraphCommandPolicies);
  return createModelCommandRuntime({
    application,
    provider,
    dispatchCommand: (request, signal) => {
      signal.throwIfAborted();
      return commandDispatcher(request, {
        authority: { principal: getCurrentInvocationContext()?.principal ?? null },
      });
    },
    instructions: todoCommandInstructions,
    formatHelp: (descriptions, request) =>
      `${request.language?.toLowerCase().startsWith('es') ? 'Podés:' : 'You can:'}\n${descriptions.map(description => `• ${description}`).join('\n')}`,
    authorize: () => {
      if (todoAuthenticationMode === 'github' && !getCurrentInvocationContext()?.principal)
        throw new ModelInterpretationError(
          'command_unauthorized',
          'Sign in before using command chat.',
        );
    },
    scope: async request => {
      const current = await contextFor();
      return {
        unresolved: current.complete
          ? undefined
          : request.language?.toLowerCase().startsWith('es')
            ? 'Los datos disponibles exceden el alcance del chat.'
            : 'The available data exceeds the command scope.',
        context: {
          creation: { id: randomUUID(), color: '#f5ddd5' },
          lists: current.lists.map(list => ({
            name: list.name,
            ref: createEntityRef(TodoList, { id: list.id }),
          })),
          items: current.items.map(item => ({
            title: item.title,
            ref: createEntityRef(TodoItem, { id: item.id }),
            completion: Selection.references(TodoItem, [
              createEntityRef(TodoItem, { id: item.id }),
            ]).toJSON(),
            completed: item.completed,
            list: current.lists.find(list => list.id === item.list.locator.id)?.name,
          })),
        },
        commands: todoCommandUpdates(current, request.text, request.language),
        bindings: todoCommandBindings(current, request.text, request.language),
      };
    },
  });
};
