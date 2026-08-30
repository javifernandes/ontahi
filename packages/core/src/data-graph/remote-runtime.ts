import { Effect, Stream } from 'effect';

import { isJsonValue } from '../value/json.js';
import { isRecord } from '../value/object.js';

import { isGraphCommandRejection } from './command-dispatcher.js';
import {
  isGraphCommandProtocolError,
  toGraphCommandRequest,
  type GraphCommandProtocolErrorCode,
  type GraphCommandRequest,
} from './command-protocol.js';
import type { GraphCommandSpec } from './command.js';
import {
  isEntityMutationCommandDiagnostic,
  isExactEntityMutationDelta,
  type EntityMutationCommand,
  type EntityMutationCommandDiagnostic,
  type EntityMutationCommandExecutionRuntime,
  type EntityMutationDelta,
} from './entity-mutation-command.js';
import { resolveQuerySpec, type QueryOrView } from './query.js';
import {
  isGraphReadProtocolError,
  toGraphReadRequest,
  type GraphReadMode,
  type GraphReadProtocolErrorCode,
  type GraphReadRequestV1,
} from './read-protocol.js';
import {
  isRelationshipCommandResult,
  type RelationshipCommandDiagnostic,
  type RelationshipCommandResult,
} from './relationship-command-result.js';
import type {
  ManyToManyRelationshipCommand,
  ManyToManyRelationshipCommandExecutionRuntime,
  RelationshipCommand,
  RelationshipCommandExecutionRuntime,
} from './relationship-command.js';
import type { DataGraphExecutionRuntime } from './runtime.js';

export type RemoteDataGraphErrorCode =
  | GraphReadProtocolErrorCode
  | GraphCommandProtocolErrorCode
  | RelationshipCommandDiagnostic['reason']
  | EntityMutationCommandDiagnostic['reason']
  | 'invalid_response'
  | 'transport_failure'
  | 'unsupported_capability';

export class RemoteDataGraphError extends Error {
  readonly _tag = 'RemoteDataGraphError';

  constructor(
    readonly code: RemoteDataGraphErrorCode,
    message: string,
    readonly cause?: unknown,
    readonly diagnostic?: RelationshipCommandDiagnostic | EntityMutationCommandDiagnostic,
  ) {
    super(message);
    this.name = 'RemoteDataGraphError';
  }
}

export type RemoteGraphReadTransport<TOptions = undefined> = (
  request: GraphReadRequestV1,
  options?: TOptions,
) => Promise<unknown>;

export type RemoteGraphCommandTransport<TOptions = undefined> = (
  request: GraphCommandRequest,
  options?: TOptions,
) => Promise<unknown>;

export type CreateRemoteDataGraphRuntimeOptions<TOptions = undefined> = {
  readonly transport: RemoteGraphReadTransport<TOptions>;
  readonly commandTransport?: RemoteGraphCommandTransport<TOptions>;
};

const invalidResponse = (mode: string) =>
  new RemoteDataGraphError(
    'invalid_response',
    `Remote data graph returned an invalid ${mode} response.`,
  );

const readResponseValue = (response: unknown, mode: GraphReadMode): unknown => {
  if (!isRecord(response)) throw invalidResponse(mode);

  if (response.kind === 'protocol-error') {
    if (!isGraphReadProtocolError(response)) throw invalidResponse(mode);
    throw new RemoteDataGraphError(response.error.code, response.error.message);
  }

  if (response.kind !== 'graph-read-result' || !isJsonValue(response.value)) {
    throw invalidResponse(mode);
  }
  if (mode === 'get' && response.value !== null && !isRecord(response.value)) {
    throw invalidResponse(mode);
  }
  if (mode === 'run' && !Array.isArray(response.value)) throw invalidResponse(mode);
  if (mode === 'count' && (!Number.isInteger(response.value) || Number(response.value) < 0)) {
    throw invalidResponse(mode);
  }

  return response.value;
};

const toRemoteDataGraphError = (cause: unknown): RemoteDataGraphError =>
  cause instanceof RemoteDataGraphError
    ? cause
    : new RemoteDataGraphError('transport_failure', 'Remote data graph transport failed.', cause);

const unsupportedCapability = (capability: string) =>
  new RemoteDataGraphError(
    'unsupported_capability',
    `Remote data graph ${capability} execution is not supported.`,
  );

const readCommandResponseValue = (response: unknown): RelationshipCommandResult => {
  if (!isRecord(response)) throw invalidResponse('Relationship Command');
  if (response.kind === 'protocol-error') {
    if (!isGraphCommandProtocolError(response)) throw invalidResponse('Relationship Command');
    throw new RemoteDataGraphError(response.error.code, response.error.message);
  }
  if (isGraphCommandRejection(response)) {
    throw new RemoteDataGraphError(
      response.diagnostic.reason,
      response.diagnostic.rejection.message,
      undefined,
      response.diagnostic,
    );
  }
  if (
    response.kind !== 'graph-command-result' ||
    !isRelationshipCommandResult(response.value) ||
    !isJsonValue(response.value)
  ) {
    throw invalidResponse('Relationship Command');
  }
  return response.value as RelationshipCommandResult;
};

const readEntityMutationResponseValue = (
  response: unknown,
  command: EntityMutationCommand,
): EntityMutationDelta => {
  if (!isRecord(response)) throw invalidResponse('Entity Mutation Command');
  if (response.kind === 'protocol-error') {
    if (!isGraphCommandProtocolError(response)) {
      throw invalidResponse('Entity Mutation Command');
    }
    throw new RemoteDataGraphError(response.error.code, response.error.message);
  }
  if (isGraphCommandRejection(response)) {
    if (!isEntityMutationCommandDiagnostic(response.diagnostic)) {
      throw invalidResponse('Entity Mutation Command');
    }
    throw new RemoteDataGraphError(
      response.diagnostic.reason,
      response.diagnostic.rejection.message,
      undefined,
      response.diagnostic,
    );
  }
  if (
    response.kind !== 'graph-command-result' ||
    !isExactEntityMutationDelta(response.value, command) ||
    !isJsonValue(response.value)
  ) {
    throw invalidResponse('Entity Mutation Command');
  }
  return response.value;
};

export const createRemoteDataGraphRuntime = <TOptions = undefined>({
  transport,
  commandTransport,
}: CreateRemoteDataGraphRuntimeOptions<TOptions>): DataGraphExecutionRuntime<
  RemoteDataGraphError,
  TOptions,
  TOptions,
  RemoteDataGraphError
> &
  ManyToManyRelationshipCommandExecutionRuntime<RemoteDataGraphError, TOptions> &
  RelationshipCommandExecutionRuntime<RemoteDataGraphError, TOptions> &
  EntityMutationCommandExecutionRuntime<RemoteDataGraphError, TOptions> => {
  const executeRead = <TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    mode: GraphReadMode,
    options?: TOptions,
  ) =>
    Effect.tryPromise({
      try: async () => {
        let request: GraphReadRequestV1;
        try {
          request = toGraphReadRequest(resolveQuerySpec(read, params), mode);
        } catch (cause) {
          throw new RemoteDataGraphError(
            'invalid_request',
            'Failed to encode the remote data graph read.',
            cause,
          );
        }

        let response: unknown;
        try {
          response = await transport(request, options);
        } catch (cause) {
          throw new RemoteDataGraphError(
            'transport_failure',
            'Remote data graph transport failed.',
            cause,
          );
        }
        return readResponseValue(response, mode);
      },
      catch: toRemoteDataGraphError,
    });

  const executeRelationshipCommand = (
    command: RelationshipCommand | ManyToManyRelationshipCommand,
    options?: TOptions,
  ) => {
    if (!commandTransport) return Effect.fail(unsupportedCapability('Relationship Command'));
    return Effect.tryPromise({
      try: async () => {
        let request: GraphCommandRequest;
        try {
          request = toGraphCommandRequest(command);
        } catch (cause) {
          throw new RemoteDataGraphError(
            'invalid_request',
            'Failed to encode the remote Relationship Command.',
            cause,
          );
        }
        let response: unknown;
        try {
          response = await commandTransport(request, options);
        } catch (cause) {
          throw new RemoteDataGraphError(
            'transport_failure',
            'Remote data graph transport failed.',
            cause,
          );
        }
        return readCommandResponseValue(response);
      },
      catch: toRemoteDataGraphError,
    });
  };

  const executeEntityMutationCommand = (command: EntityMutationCommand, options?: TOptions) => {
    if (!commandTransport) return Effect.fail(unsupportedCapability('Entity Mutation Command'));
    return Effect.tryPromise({
      try: async () => {
        let request: GraphCommandRequest;
        try {
          request = toGraphCommandRequest(command);
        } catch (cause) {
          throw new RemoteDataGraphError(
            'invalid_request',
            'Failed to encode the remote Entity Mutation Command.',
            cause,
          );
        }
        let response: unknown;
        try {
          response = await commandTransport(request, options);
        } catch (cause) {
          throw new RemoteDataGraphError(
            'transport_failure',
            'Remote data graph transport failed.',
            cause,
          );
        }
        return readEntityMutationResponseValue(response, command);
      },
      catch: toRemoteDataGraphError,
    });
  };

  return {
    get: <TParams, TResult>(
      read: QueryOrView<TParams, TResult>,
      params: TParams,
      options?: TOptions,
    ) =>
      executeRead(read, params, 'get', options) as Effect.Effect<
        TResult | null,
        RemoteDataGraphError
      >,
    run: <TParams, TResult>(
      read: QueryOrView<TParams, TResult>,
      params: TParams,
      options?: TOptions,
    ) =>
      executeRead(read, params, 'run', options) as Effect.Effect<TResult[], RemoteDataGraphError>,
    count: <TParams, TResult>(
      read: QueryOrView<TParams, TResult>,
      params: TParams,
      options?: TOptions,
    ) => executeRead(read, params, 'count', options) as Effect.Effect<number, RemoteDataGraphError>,
    stream: () => Stream.fail(unsupportedCapability('stream')),
    runCommand: <TResult>(_command: GraphCommandSpec<any, any, TResult>, _options?: TOptions) =>
      Effect.fail(unsupportedCapability('Command')),
    runRelationshipCommand: executeRelationshipCommand,
    runManyToManyRelationshipCommand: executeRelationshipCommand,
    runEntityMutationCommand: executeEntityMutationCommand,
  };
};
