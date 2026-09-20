import { isRecord } from '../../value/object.js';
import type { ModelCommandRequest, ModelCommandResult } from '../contracts.js';

import type { OntahiApplication } from './application.js';
import {
  interpretModelOperation,
  validateModelInvocation,
  ModelInterpretationError,
  type ModelProvider,
  type ModelOperationExposure,
} from './model-interpretation.js';
import { createOperationInvocationDispatcher } from './operation-invocation.js';

export type ModelCommandBinding = Omit<ModelOperationExposure, 'operationId' | 'description'> & {
  message?: (input: Record<string, unknown>) => string;
};
export type ModelCommandScope = {
  context: unknown;
  bindings: Readonly<Record<string, ModelCommandBinding>>;
  unresolved?: string;
};
export type ModelCommandRuntime = {
  submit(request: ModelCommandRequest, signal: AbortSignal): Promise<ModelCommandResult>;
};

/** Runtime entry point for graph instructions. The host supplies disclosure scope and bindings;
 * the operation declarations supply descriptions and canonical contracts. */
export const createModelCommandRuntime = ({
  application,
  provider,
  authorize,
  scope,
  instructions,
}: {
  application: OntahiApplication;
  provider: ModelProvider;
  authorize: () => void | Promise<void>;
  scope: (request: ModelCommandRequest, signal: AbortSignal) => Promise<ModelCommandScope>;
  instructions?: string;
}): ModelCommandRuntime => {
  const resolveOperation = (id: string) => application.resolveOperation(id);
  const dispatch = createOperationInvocationDispatcher(application);
  const catalog = (current: ModelCommandScope): ModelOperationExposure[] =>
    Object.entries(current.bindings).map(([operationId, binding]) => {
      const operation = resolveOperation(operationId);
      if (!operation)
        throw new ModelInterpretationError(
          'command_unavailable',
          `Missing operation ${operationId}.`,
        );
      return { ...binding, operationId, description: operation.description ?? operationId };
    });
  return {
    submit: async (request, signal) => {
      await authorize();
      signal.throwIfAborted();
      if (
        !isRecord(request) ||
        typeof request.text !== 'string' ||
        !request.text.trim() ||
        request.text.length > 2000 ||
        Object.keys(request).some(key => key !== 'text' && key !== 'context')
      )
        throw new ModelInterpretationError(
          'command_invalid',
          'Write a request between 1 and 2,000 characters.',
        );
      const initial = await scope(request, signal);
      if (initial.unresolved) return { status: 'unresolved', message: initial.unresolved };
      const proposal = await interpretModelOperation({
        provider,
        operations: catalog(initial),
        resolveOperation,
        context: initial.context,
        prompt: request.text,
        signal,
        instructions,
      });
      if (proposal.status === 'unresolved')
        return { status: 'unresolved', message: proposal.reason };
      await authorize();
      signal.throwIfAborted();
      const current = await scope(request, signal);
      if (current.unresolved) return { status: 'unresolved', message: current.unresolved };
      const reason = validateModelInvocation(
        proposal.invocation,
        catalog(current),
        resolveOperation,
      );
      if (reason) return { status: 'unresolved', message: reason };
      signal.throwIfAborted();
      const result = await dispatch(proposal.invocation);
      if (result.kind !== 'invocation-result' || !result.result.ok)
        throw new ModelInterpretationError(
          'command_execution_failed',
          result.kind === 'invocation-result' && !result.result.ok
            ? (result.result.message ?? 'The operation failed.')
            : 'Operation unavailable.',
        );
      return {
        status: 'executed',
        message:
          current.bindings[proposal.invocation.operationId]?.message?.(
            proposal.invocation.input as Record<string, unknown>,
          ) ?? 'Operation completed.',
      };
    },
  };
};
