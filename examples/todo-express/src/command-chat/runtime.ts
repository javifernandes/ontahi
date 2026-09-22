import { toGraphCommandRequest, type GraphReadDispatcher } from '@ontahi/core/data-graph';
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
    dispatchUpdate: (command, signal) => {
      signal.throwIfAborted();
      return commandDispatcher(toGraphCommandRequest(command), {
        authority: { principal: getCurrentInvocationContext()?.principal ?? null },
      });
    },
    instructions:
      todoCommandInstructions +
      '\nRenaming changes an existing entity, it never creates one. For "rename list Home to House", return {"status":"update","entityName":"TodoList","target":{"name":"Home"},"values":{"name":"House"}}. For "rename item buy bread to buy wholemeal bread", return {"status":"update","entityName":"TodoItem","target":{"title":"buy bread"},"values":{"title":"buy wholemeal bread"}}. For duplicate item titles ask for a list. Only put listName in target if the user explicitly names it.',
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
          lists: current.lists.map(list => list.name),
          items: current.items.map(item => ({
            title: item.title,
            completed: item.completed,
            list: current.lists.find(list => list.id === item.list.locator.id)?.name,
          })),
        },
        updates: todoCommandUpdates(current, request.text, request.language),
        bindings: todoCommandBindings(current, request.text, request.language),
      };
    },
  });
};
