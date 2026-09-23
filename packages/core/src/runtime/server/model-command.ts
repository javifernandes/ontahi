import {
  type GraphCommandDispatchResponse,
  type GraphCommandRequest,
} from '../../data-graph/index.js';
import { isRecord } from '../../value/object.js';
import type { ModelCommandRequest, ModelCommandResult } from '../contracts.js';

import type { OntahiApplication } from './application.js';
import { resolveModelGraphCommand, type ModelGraphCommandExposure } from './model-graph-command.js';
import {
  interpretModelRequest,
  validateModelInvocation,
  ModelInterpretationError,
  type ModelProvider,
  type ModelOperationExposure,
} from './model-interpretation.js';
import { createOperationInvocationDispatcher } from './operation-invocation.js';

export type ModelCommandBinding = Omit<ModelOperationExposure, 'operationId' | 'description'> & {
  /** Override only when the exposed arguments narrow the operation's advertised behavior. */
  description?: string;
  message?: (input: Record<string, unknown>) => string;
};
export type ModelCommandScope = {
  context: unknown;
  bindings: Readonly<Record<string, ModelCommandBinding>>;
  commands?: readonly ModelGraphCommandExposure[];
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
  formatHelp,
  dispatchCommand,
}: {
  application: OntahiApplication;
  provider: ModelProvider;
  authorize: () => void | Promise<void>;
  scope: (request: ModelCommandRequest, signal: AbortSignal) => Promise<ModelCommandScope>;
  dispatchCommand?: (
    request: GraphCommandRequest,
    signal: AbortSignal,
  ) => Promise<GraphCommandDispatchResponse>;
  instructions?: string;
  /** Localize capability presentation without asking the model to invent descriptions. */
  formatHelp?: (descriptions: readonly string[], request: ModelCommandRequest) => string;
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
      return {
        ...binding,
        operationId,
        description:
          binding.description ?? operation.description ?? 'Action description unavailable.',
      };
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
        Object.keys(request).some(key => key !== 'text' && key !== 'context' && key !== 'language')
      )
        throw new ModelInterpretationError(
          'command_invalid',
          'Write a request between 1 and 2,000 characters.',
        );
      if (request.language !== undefined) {
        try {
          if (
            typeof request.language !== 'string' ||
            request.language.length > 64 ||
            Intl.getCanonicalLocales(request.language).length !== 1
          )
            throw new Error('Invalid language');
        } catch {
          throw new ModelInterpretationError(
            'command_invalid',
            'Choose a valid response language.',
          );
        }
      }
      const initial = await scope(request, signal);
      if (initial.unresolved) return { status: 'unresolved', message: initial.unresolved };
      const proposal = await interpretModelRequest({
        provider,
        operations: catalog(initial),
        commands: initial.commands,
        resolveOperation,
        context: initial.context,
        prompt: request.text,
        signal,
        instructions: [
          instructions,
          request.language
            ? `Write any user-facing reason in ${request.language}, regardless of the request's language. Never translate entity names, item titles, operation IDs, or argument keys.`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      await authorize();
      signal.throwIfAborted();
      if (proposal.status === 'help')
        return {
          status: 'answered',
          message:
            formatHelp?.(
              [
                ...catalog(initial).map(op => op.description),
                ...(initial.commands ?? []).map(command => command.description),
              ],
              request,
            ) ??
            `You can:\n${[
              ...catalog(initial).map(op => op.description),
              ...(initial.commands ?? []).map(command => command.description),
            ]
              .map(description => `• ${description}`)
              .join('\n')}`,
        };
      if (proposal.status === 'unresolved')
        return { status: 'unresolved', message: proposal.reason };
      if (proposal.request.kind === 'graph-command') {
        if (!dispatchCommand)
          throw new ModelInterpretationError(
            'command_unavailable',
            'Graph commands are not configured.',
          );
        const fresh = await scope(request, signal);
        if (fresh.unresolved) return { status: 'unresolved', message: fresh.unresolved };
        const exposure = resolveModelGraphCommand(proposal.request, fresh.commands ?? []);
        const reason = exposure.validate(proposal.request);
        if (reason) return { status: 'unresolved', message: reason };
        signal.throwIfAborted();
        const result = await dispatchCommand(proposal.request, signal);
        if (result.kind !== 'graph-command-result')
          throw new ModelInterpretationError(
            'command_execution_failed',
            'The graph command was rejected.',
          );
        return { status: 'executed', message: exposure.message?.(proposal.request) ?? 'Updated.' };
      }
      const current = await scope(request, signal);
      if (current.unresolved) return { status: 'unresolved', message: current.unresolved };
      const reason = validateModelInvocation(proposal.request, catalog(current), resolveOperation);
      if (reason) return { status: 'unresolved', message: reason };
      signal.throwIfAborted();
      const result = await dispatch(proposal.request);
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
          current.bindings[proposal.request.operationId]?.message?.(
            proposal.request.input as Record<string, unknown>,
          ) ?? 'Operation completed.',
      };
    },
  };
};
