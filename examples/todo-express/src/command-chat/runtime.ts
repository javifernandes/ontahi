import type { GraphReadDispatcher } from '@ontahi/core/data-graph';
import {
  createModelCommandRuntime,
  getCurrentInvocationContext,
  ModelInterpretationError,
  type OntahiApplication,
  type ModelProvider,
} from '@ontahi/core/runtime/server';

import { todoAuthenticationMode } from '../authentication-mode.js';
import type { TodoGraphReadAuthority } from '../todo-read-policies.js';

import { todoCommandBindings, todoCommandInstructions } from './bindings.js';
import { createCommandContextReader } from './context.js';

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
  return createModelCommandRuntime({
    application,
    provider,
    instructions: todoCommandInstructions,
    authorize: () => {
      if (todoAuthenticationMode === 'github' && !getCurrentInvocationContext()?.principal)
        throw new ModelInterpretationError(
          'command_unauthorized',
          'Sign in before using command chat.',
        );
    },
    scope: async request => {
      const current = await contextFor(request);
      return {
        unresolved: current.complete ? undefined : 'The available data exceeds the command scope.',
        context: {
          list: current.list?.name ?? null,
          lists: current.lists.map(list => list.name),
          items: current.items
            .filter(item => !item.completed)
            .map(item => ({
              title: item.title,
              list: current.lists.find(list => list.id === item.list.locator.id)?.name,
            })),
        },
        bindings: todoCommandBindings(current),
      };
    },
  });
};
