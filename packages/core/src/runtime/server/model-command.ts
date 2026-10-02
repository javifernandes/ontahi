import {
  type AnyEntityDefinition,
  type AnyGraphObjectDefinition,
  type GraphCommandDispatchResponse,
  type GraphCommandRequest,
  type GraphReadDispatchResponse,
  type GraphReadRequest,
} from '../../data-graph/index.js';
import { isJsonValue } from '../../value/json.js';
import { isRecord } from '../../value/object.js';
import type { ModelCommandRequest, ModelCommandResult } from '../contracts.js';
import type { OperationInvokeRequest } from '../operation-invocation.js';

import type { OntahiApplication } from './application.js';
import { resolveModelGraphCommand, type ModelGraphCommandExposure } from './model-graph-command.js';
import {
  modelGraphReadApplicationEntityMatches,
  resolveModelGraphReadApplication,
  type ModelEntityCandidate,
  type ModelGraphReadApplicationProposal,
} from './model-graph-read-application.js';
import {
  resolveModelGraphRead,
  type ModelGraphReadExposure,
  type ModelGraphReadResult,
} from './model-graph-read.js';
import {
  interpretModelRequest,
  validateModelInvocation,
  ModelInterpretationError,
  type ModelProvider,
  type ModelOperationExposure,
} from './model-interpretation.js';
import {
  modelOperationApplicationEntityMatches,
  resolveModelOperationApplication,
  type ModelOperationApplicationProposal,
} from './model-operation-application.js';
import { createOperationInvocationDispatcher } from './operation-invocation.js';

export type ModelCommandBinding = Omit<ModelOperationExposure, 'operationId' | 'description'> & {
  /** Override only when the exposed arguments narrow the operation's advertised behavior. */
  description?: string;
  message?: (input: Record<string, unknown>) => string;
};
export type ModelCommandScope = {
  context?: unknown;
  /** Authorized, already-disclosed entities that may satisfy model-proposed Ref holes. */
  entityCandidates?: readonly ModelEntityCandidate[];
  bindings?: Readonly<Record<string, ModelCommandBinding>>;
  reads?: readonly ModelGraphReadExposure[];
  commands?: readonly ModelGraphCommandExposure[];
  unresolved?: string;
};
export type ModelCommandCanonicalRequest =
  | GraphReadRequest
  | GraphCommandRequest
  | OperationInvokeRequest;
export type ModelCommandPreparation =
  | ModelCommandResult<ModelCommandCanonicalRequest, ModelGraphReadResult>
  | {
      status: 'choice';
      prompt: string;
      options: ReadonlyArray<{
        id: string;
        label: string;
        request: ModelCommandCanonicalRequest;
      }>;
    }
  | { status: 'proposed'; request: ModelCommandCanonicalRequest };
export type ModelCommandRuntime = {
  submit(
    request: ModelCommandRequest,
    signal: AbortSignal,
  ): Promise<ModelCommandResult<ModelCommandCanonicalRequest, ModelGraphReadResult>>;
};
export type PreparedModelCommandRuntime = ModelCommandRuntime & {
  prepare(request: ModelCommandRequest, signal: AbortSignal): Promise<ModelCommandPreparation>;
  execute(
    request: ModelCommandRequest,
    proposal: ModelCommandCanonicalRequest,
    signal: AbortSignal,
    context?: { kind: 'proposal' | 'choice-option' },
  ): Promise<ModelCommandResult<ModelCommandCanonicalRequest, ModelGraphReadResult>>;
};

export type CreateModelCommandRuntimeOptions = {
  application: OntahiApplication;
  graphEntities?: readonly AnyEntityDefinition[];
  resolveEntityMatch?: (
    request: { target: AnyEntityDefinition; text: string },
    signal: AbortSignal,
  ) => Promise<
    | { status: 'matched'; candidates: readonly ModelEntityCandidate[] }
    | { status: 'unresolved'; reason: string }
  >;
  provider: ModelProvider;
  authorize: () => void | Promise<void>;
  scope: (request: ModelCommandRequest, signal: AbortSignal) => Promise<ModelCommandScope>;
  dispatchRead?: (
    request: GraphReadRequest,
    signal: AbortSignal,
  ) => Promise<GraphReadDispatchResponse>;
  dispatchCommand?: (
    request: GraphCommandRequest,
    signal: AbortSignal,
  ) => Promise<GraphCommandDispatchResponse>;
  instructions?: string;
  /** Localize capability presentation without asking the model to invent descriptions. */
  formatHelp?: (descriptions: readonly string[], request: ModelCommandRequest) => string;
};

/** Runtime entry point for graph instructions. The host supplies a disclosure scope;
 * reflected graph affordances and optional Operations supply canonical contracts. */
export const createModelCommandRuntime = ({
  application,
  provider,
  authorize,
  scope,
  instructions,
  formatHelp,
  dispatchRead,
  dispatchCommand,
  graphEntities = [],
  resolveEntityMatch,
}: CreateModelCommandRuntimeOptions): PreparedModelCommandRuntime => {
  const resolveOperation = (id: string) => application.resolveOperation(id);
  const dispatch = createOperationInvocationDispatcher(application);
  const catalog = (current: ModelCommandScope): ModelOperationExposure[] =>
    Object.entries(current.bindings ?? {}).map(([operationId, binding]) => {
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
  const validateRequest = (request: ModelCommandRequest) => {
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
        throw new ModelInterpretationError('command_invalid', 'Choose a valid response language.');
      }
    }
  };

  const prepare: PreparedModelCommandRuntime['prepare'] = async (request, signal) => {
    validateRequest(request);
    await authorize();
    signal.throwIfAborted();
    const initial = await scope(request, signal);
    if (initial.unresolved) return { status: 'unresolved', message: initial.unresolved };
    const proposal = await interpretModelRequest({
      provider,
      operations: catalog(initial),
      reads: initial.reads,
      commands: initial.commands,
      resolveOperation,
      context: initial.context,
      prompt: request.text,
      signal,
      instructions: [
        instructions,
        request.language
          ? `Write any user-facing reason in ${request.language}, regardless of the request's language.`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
    if (proposal.status === 'resolved') return { status: 'proposed', request: proposal.request };
    if (proposal.status === 'choice') return proposal;
    if (proposal.status === 'application') {
      if (proposal.application.kind === 'operation-application') {
        const operationProposal = proposal as typeof proposal & ModelOperationApplicationProposal;
        if (
          !catalog(initial).some(
            item => item.operationId === operationProposal.application.operationId,
          )
        )
          return { status: 'unresolved', message: 'Operation is outside the configured scope.' };
        const operation = resolveOperation(operationProposal.application.operationId);
        if (!operation || operation.input.kind !== 'schema.object')
          return { status: 'unresolved', message: 'Operation is outside the configured scope.' };
        const operationInput = operation.input as AnyGraphObjectDefinition;
        const matches = modelOperationApplicationEntityMatches(operationProposal, {
          id: operationProposal.application.operationId,
          input: operationInput,
        });
        if (!matches || !resolveEntityMatch)
          return {
            status: 'unresolved',
            message: 'The proposed operation has an unsupported Hole.',
          };
        const candidates: Record<string, readonly ModelEntityCandidate[]> = {};
        for (const match of matches) {
          const result = await resolveEntityMatch(
            { target: match.target, text: match.text },
            signal,
          );
          if (result.status === 'unresolved')
            return { status: 'unresolved', message: result.reason };
          candidates[match.holeId] = result.candidates;
        }
        const resolved = resolveModelOperationApplication(
          operationProposal,
          { id: operationProposal.application.operationId, input: operationInput },
          candidates,
        );
        if (resolved.status === 'unresolved')
          return { status: 'unresolved', message: resolved.reason };
        const requests =
          resolved.status === 'resolved'
            ? [resolved.request]
            : resolved.options.map(option => option.request);
        for (const candidate of requests) {
          const reason = validateModelInvocation(candidate, catalog(initial), resolveOperation, {
            kind: resolved.status === 'choice' ? 'choice-option' : 'proposal',
          });
          if (reason) return { status: 'unresolved', message: reason };
        }
        return resolved.status === 'resolved'
          ? { status: 'proposed', request: resolved.request }
          : resolved;
      }
      const readProposal = proposal as typeof proposal & ModelGraphReadApplicationProposal;
      const entityCandidates = [...(initial.entityCandidates ?? [])];
      if (resolveEntityMatch) {
        const matches = modelGraphReadApplicationEntityMatches(readProposal, graphEntities);
        if (!matches)
          return { status: 'unresolved', message: 'The proposed read has an unsupported Hole.' };
        for (const match of matches) {
          const result = await resolveEntityMatch(
            { target: match.target, text: match.match.text },
            signal,
          );
          if (result.status === 'unresolved')
            return { status: 'unresolved', message: result.reason };
          entityCandidates.push(...result.candidates);
        }
      }
      const resolved = resolveModelGraphReadApplication({
        proposal: readProposal,
        entities: graphEntities,
        candidates: entityCandidates,
      });
      if (resolved.status === 'unresolved')
        return { status: 'unresolved', message: resolved.reason };
      const candidates =
        resolved.status === 'resolved'
          ? [resolved.request]
          : resolved.options.map(option => option.request);
      for (const candidate of candidates) {
        let exposure: ModelGraphReadExposure;
        try {
          exposure = resolveModelGraphRead(candidate, initial.reads ?? []);
        } catch (error) {
          if (error instanceof ModelInterpretationError && error.code === 'proposal_out_of_scope')
            return { status: 'unresolved', message: error.message };
          throw error;
        }
        const reason = exposure.validate(candidate);
        if (reason) return { status: 'unresolved', message: reason };
      }
      return resolved.status === 'resolved'
        ? { status: 'proposed', request: resolved.request }
        : resolved;
    }
    await authorize();
    signal.throwIfAborted();
    if (proposal.status === 'help')
      return {
        status: 'answered',
        message:
          formatHelp?.(
            [
              ...catalog(initial).map(op => op.description),
              ...(initial.reads ?? []).map(read => read.description),
              ...(initial.commands ?? []).map(command => command.description),
            ],
            request,
          ) ??
          `You can:\n${[
            ...catalog(initial).map(op => op.description),
            ...(initial.reads ?? []).map(read => read.description),
            ...(initial.commands ?? []).map(command => command.description),
          ]
            .map(description => `• ${description}`)
            .join('\n')}`,
      };
    return { status: 'unresolved', message: proposal.reason };
  };

  const execute: PreparedModelCommandRuntime['execute'] = async (
    request,
    proposal,
    signal,
    validation = { kind: 'proposal' },
  ) => {
    validateRequest(request);
    await authorize();
    signal.throwIfAborted();
    if (proposal.kind === 'graph-read') {
      if (!dispatchRead)
        throw new ModelInterpretationError(
          'command_unavailable',
          'Graph reads are not configured.',
        );
      const fresh = await scope(request, signal);
      if (fresh.unresolved) return { status: 'unresolved', message: fresh.unresolved };
      const exposure = resolveModelGraphRead(proposal, fresh.reads ?? []);
      const reason = exposure.validate(proposal);
      if (reason) return { status: 'unresolved', message: reason };
      signal.throwIfAborted();
      const response = await dispatchRead(proposal, signal);
      if (response.kind !== 'graph-read-result' || !isJsonValue(response.value))
        throw new ModelInterpretationError(
          'command_execution_failed',
          response.kind === 'protocol-error'
            ? response.error.message
            : 'The graph read was rejected.',
        );
      const readResponse: ModelGraphReadResult = {
        kind: 'graph-read-result',
        value: response.value,
        ...(response.capabilities === undefined ? {} : { capabilities: response.capabilities }),
      };
      return {
        status: 'executed',
        message: exposure.message?.(readResponse, proposal) ?? 'Read completed.',
        request: proposal,
        response: readResponse,
      };
    }
    if (proposal.kind === 'graph-command') {
      if (!dispatchCommand)
        throw new ModelInterpretationError(
          'command_unavailable',
          'Graph commands are not configured.',
        );
      const fresh = await scope(request, signal);
      if (fresh.unresolved) return { status: 'unresolved', message: fresh.unresolved };
      const exposure = resolveModelGraphCommand(proposal, fresh.commands ?? []);
      const reason = exposure.validate(proposal, validation);
      if (reason) return { status: 'unresolved', message: reason };
      signal.throwIfAborted();
      const result = await dispatchCommand(proposal, signal);
      if (result.kind !== 'graph-command-result')
        throw new ModelInterpretationError(
          'command_execution_failed',
          'The graph command was rejected.',
        );
      return {
        status: 'executed',
        message: exposure.message?.(proposal) ?? 'Updated.',
        request: proposal,
      };
    }
    const current = await scope(request, signal);
    if (current.unresolved) return { status: 'unresolved', message: current.unresolved };
    const reason = validateModelInvocation(
      proposal,
      catalog(current),
      resolveOperation,
      validation,
    );
    if (reason) return { status: 'unresolved', message: reason };
    signal.throwIfAborted();
    const result = await dispatch(proposal);
    if (result.kind !== 'invocation-result' || !result.result.ok)
      throw new ModelInterpretationError(
        'command_execution_failed',
        result.kind === 'invocation-result' && !result.result.ok
          ? (result.result.message ?? 'The operation failed.')
          : 'Operation unavailable.',
      );
    const operation = resolveOperation(proposal.operationId);
    if (operation?.durable) {
      const run = result.result.value;
      if (!isRecord(run) || typeof run.taskId !== 'string' || typeof run.runId !== 'string')
        throw new ModelInterpretationError(
          'command_execution_failed',
          'The durable Operation did not return a Task run.',
        );
      return {
        status: 'started',
        message:
          current.bindings?.[proposal.operationId]?.message?.(
            proposal.input as Record<string, unknown>,
          ) ?? 'Operation started.',
        request: proposal,
        run: { taskId: run.taskId, runId: run.runId },
      };
    }
    return {
      status: 'executed',
      message:
        current.bindings?.[proposal.operationId]?.message?.(
          proposal.input as Record<string, unknown>,
        ) ?? 'Operation completed.',
      request: proposal,
    };
  };

  return {
    prepare,
    execute,
    submit: async (request, signal) => {
      const prepared = await prepare(request, signal);
      if (prepared.status === 'proposed') return execute(request, prepared.request, signal);
      if (prepared.status === 'choice') return { status: 'unresolved', message: prepared.prompt };
      return prepared;
    },
  };
};
