import { randomUUID } from 'node:crypto';

import { createEntityRef, Selection } from '@ontahi/core/data-graph';
import {
  createApplicationModelCommandRuntime,
  getCurrentInvocationContext,
  ModelInterpretationError,
  type GraphCommandableOntahiApplication,
  type GraphReadableOntahiApplication,
  type ModelProvider,
  type OntahiApplication,
} from '@ontahi/core/runtime/server';

import { todoAuthenticationMode } from '../authentication-mode.js';
import { todoGraphCommandPolicies } from '../todo-command-policies.js';
import { todoGraphReadPolicies, type TodoGraphReadAuthority } from '../todo-read-policies.js';
import { TodoItem, TodoList } from '../todo.js';

import { todoCommandBindings, todoCommandInstructions } from './bindings.js';
import { readTodoModelContext } from './context.js';
import { todoGraphCommands } from './graph-commands.js';
import { todoGraphReads } from './graph-reads.js';

// Application composition only; orchestration lives in the Ontahi runtime.
export const createTodoModelRuntime = ({
  application,
  provider,
}: {
  application: OntahiApplication &
    Partial<GraphReadableOntahiApplication & GraphCommandableOntahiApplication>;
  provider: ModelProvider;
}) => {
  return createApplicationModelCommandRuntime<TodoGraphReadAuthority>({
    application,
    provider,
    graph: {
      authority: () => ({ principal: getCurrentInvocationContext()?.principal ?? null }),
      readPolicies: todoGraphReadPolicies,
      commandPolicies: todoGraphCommandPolicies,
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
    scope: async (request, signal, graph) => {
      if (!graph.read)
        throw new ModelInterpretationError('context_unavailable', 'Graph reads are unavailable.');
      const current = await readTodoModelContext(graph.read, signal);
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
        reads: todoGraphReads(request.language),
        commands: todoGraphCommands(current, request.text, request.language),
        bindings: todoCommandBindings(current, request.text, request.language),
      };
    },
  });
};
