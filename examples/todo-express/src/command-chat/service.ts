import { createEntityRef, safeParseGraphSchema } from '@ontahi/core/data-graph';
import type { GraphReadDispatcher } from '@ontahi/core/data-graph';
import {
  createOperationInvocationDispatcher,
  interpretModelOperation,
  validateModelInvocation,
  type OntahiApplication,
  type ModelProvider,
} from '@ontahi/core/runtime/server';

import type { TodoGraphReadAuthority } from '../todo-read-policies.js';
import { TodoList } from '../todo.js';

import { createCommandContextReader } from './context.js';
import { CommandInterpretation, TodoCommandError, type TodoCommandService } from './contracts.js';
import { todoCommandOperations, todoCommandInstructions } from './operations.js';

export const createTodoCommandService = ({
  application,
  read,
  provider,
}: {
  application: OntahiApplication;
  read: GraphReadDispatcher<TodoGraphReadAuthority>;
  provider?: ModelProvider;
}): TodoCommandService => {
  const dispatch = createOperationInvocationDispatcher(application);
  const contextFor = createCommandContextReader(read);
  const resolveOperation = (id: string) => application.resolveOperation(id);
  return {
    interpret: async (input, signal) => {
      if (!provider)
        throw new TodoCommandError(
          'model_disabled',
          'Command chat is disabled. Configure TODO_LLM_MODEL and restart the server.',
        );
      const context = await contextFor(input);
      if (!context.complete)
        return { status: 'unresolved', reason: 'The available data exceeds the command scope.' };
      return interpretModelOperation({
        provider,
        instructions: todoCommandInstructions,
        resolveOperation,
        operations: todoCommandOperations(context),
        context: {
          list: context.list?.name ?? null,
          lists: context.lists.map(list => list.name),
          items: context.items.filter(item => !item.completed).map(item => item.title),
        },
        prompt: input.text,
        signal,
      });
    },
    submit: async (input, signal) => {
      const response = await dispatch({
        kind: 'invoke',
        operationId: 'TodoList.interpretCommand',
        input: {
          text: input.text,
          list: input.listId === null ? null : createEntityRef(TodoList, { id: input.listId }),
        },
      });
      if (response.kind !== 'invocation-result' || !response.result.ok)
        throw new TodoCommandError(
          'interpretation_failed',
          response.kind === 'invocation-result' && !response.result.ok
            ? (response.result.message ?? 'Interpretation failed.')
            : 'Interpretation unavailable.',
        );
      const parsed = safeParseGraphSchema(CommandInterpretation, response.result.value);
      if (!parsed.success)
        throw new TodoCommandError(
          'model_output_invalid',
          'Interpretation returned an invalid result.',
        );
      const proposal = parsed.data;
      if (proposal.status === 'unresolved')
        return { status: 'unresolved', message: proposal.reason };
      signal.throwIfAborted();
      // Revalidate canonical inputs with fresh data, including for a code-backed interpreter.
      const context = await contextFor(input);
      const operations = todoCommandOperations(context);
      const reason = validateModelInvocation(proposal.invocation, operations, resolveOperation);
      if (reason) return { status: 'unresolved', message: reason };
      signal.throwIfAborted();
      const result = await dispatch(proposal.invocation);
      if (result.kind !== 'invocation-result' || !result.result.ok)
        throw new TodoCommandError(
          'command_execution_failed',
          result.kind === 'invocation-result' && !result.result.ok
            ? (result.result.message ?? 'The operation failed.')
            : 'Operation unavailable.',
        );
      return {
        status: 'executed',
        message: operations
          .find(op => op.operationId === proposal.invocation.operationId)!
          .message(proposal.invocation.input as Record<string, unknown>),
      };
    },
  };
};
