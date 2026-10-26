import { Cause, Option, Runtime, type Stream } from 'effect';

import {
  graphReadProtocolError,
  isGraphReadProtocolError,
  parseGraphReadRequest,
  type CommittedMutationSet,
  type EntityMutationCommandPolicy,
  type GraphReadDispatchResponse,
  type GraphReadObservationResponse,
  type GraphReadPolicy,
  type ManyToManyRelationshipCommandPolicy,
  type OrderedRelationshipCommandPolicy,
  type RelationshipCommandPolicy,
} from '../../data-graph/index.js';
import { isJsonValue } from '../../value/json.js';
import type { TaskActor, TaskRunIdentity, TaskSnapshot } from '../contracts.js';
import {
  createRuntimeProtocolDispatcher,
  createTaskRunDurableOperationObserver,
  durableOperationProtocolError,
  toDurableOperationSnapshotResponse,
  withRuntimeProtocolMetadata,
  type RuntimeProtocolDispatcher,
  type RuntimeProtocolDurableObserver,
  type RuntimeProtocolEventObserver,
  type RuntimeProtocolGraphObserver,
} from '../protocol/index.js';

import {
  createActiveGraphObservationRegistry,
  type GraphObservationRefreshCause,
} from './active-graph-observations.js';
import { serverContext } from './context.js';
import type { EventApplication, EventDelivery } from './events/index.js';
import type { InvocationContextInput } from './invocation-context.js';
import { getCurrentInvocationContext } from './invocation-context.js';
import { submitModelCommandProtocol } from './model/command/protocol.js';
import type { ModelCommandRuntime } from './model/command/runtime.js';
import type {
  GraphCommandableOntahiApplication,
  GraphObservableOntahiApplication,
  GraphReadableOntahiApplication,
} from './ontahi.js';
import { createOperationInvocationDispatcher } from './operation-invocation.js';
import {
  COMMITTED_MUTATION_DELIVERY_RESOURCE_KEY,
  createCommittedMutationCommit,
  getRequiredUnitOfWork,
  sealUnitOfWorkMutationJournal,
  type CommittedMutationDelivery,
} from './unit-of-work.js';

type RuntimeProtocolApplication = GraphReadableOntahiApplication &
  GraphObservableOntahiApplication &
  GraphCommandableOntahiApplication & {
    readonly events: EventApplication<any>;
    readonly app: {
      readonly runtime: {
        withInvocationContext<TValue>(context: InvocationContextInput, run: () => TValue): TValue;
      };
      readonly task: {
        observe(run: TaskRunIdentity): Stream.Stream<TaskSnapshot, unknown>;
      };
    };
  };

export type ApplicationRuntimeGraphCommandPolicy<TContext = unknown> =
  | RelationshipCommandPolicy
  | ManyToManyRelationshipCommandPolicy
  | OrderedRelationshipCommandPolicy
  | EntityMutationCommandPolicy<any, TContext>;

export type ApplicationRuntimePolicy<TContext = unknown> =
  | GraphReadPolicy<any, TContext>
  | ApplicationRuntimeGraphCommandPolicy<TContext>;

export type ApplicationRuntimeProtocolOptions<TContext extends InvocationContextInput> = {
  readonly application: RuntimeProtocolApplication;
  readonly policies: readonly ApplicationRuntimePolicy<TContext>[];
  readonly modelCommand?: { readonly runtime: ModelCommandRuntime };
  /** Explicit authority-scoped projection. Mutation metadata is withheld when omitted. */
  readonly projectCommittedMutations?: (
    mutations: CommittedMutationSet,
    details: {
      readonly context: TContext;
      readonly family: 'operation' | 'graph.command' | 'durable.operation' | 'model.command';
    },
  ) => CommittedMutationSet | undefined | PromiseLike<CommittedMutationSet | undefined>;
  /** Explicit authority-scoped projection. Event subscription is unavailable when omitted. */
  readonly projectEventDelivery?: (
    delivery: EventDelivery,
    context: TContext,
  ) => EventDelivery | undefined | PromiseLike<EventDelivery | undefined>;
  /** Returning null denies an Interaction response. Authenticated principals are mapped by default. */
  readonly taskInteractionActor?: (context: TContext) => TaskActor | null;
  readonly reportError?: (error: unknown) => void;
};

export type ApplicationRuntimeProtocol<TContext> = {
  readonly dispatcher: RuntimeProtocolDispatcher<TContext>;
  readonly observeDurableOperation: RuntimeProtocolDurableObserver<TContext>;
  readonly observeGraph: RuntimeProtocolGraphObserver<TContext>;
  readonly observeEvent?: RuntimeProtocolEventObserver<TContext>;
  readonly graphReadPolicies: readonly GraphReadPolicy<any, TContext>[];
  readonly graphCommandPolicies: readonly ApplicationRuntimeGraphCommandPolicy<TContext>[];
};

type GraphObservationRaceOutcome =
  | {
      readonly kind: 'native';
      readonly result: IteratorResult<GraphReadObservationResponse>;
    }
  | {
      readonly kind: 'mutation';
      readonly causedBy: GraphObservationRefreshCause | undefined;
    };

const isGraphReadPolicy = <TContext>(
  policy: ApplicationRuntimePolicy<TContext>,
): policy is GraphReadPolicy<any, TContext> =>
  'modes' in policy && 'cardinalities' in policy && 'maxLimit' in policy;

const actorFromContext = (context: InvocationContextInput): TaskActor | null => {
  const principal = context.principal;
  return principal ? { kind: principal.kind, id: principal.subject } : null;
};

const hasTaskInteractionAccessDeniedReason = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'reason' in error &&
  error.reason === 'task_interaction_access_denied';

const isTaskInteractionAccessDenied = (error: unknown) => {
  if (!Runtime.isFiberFailure(error)) return hasTaskInteractionAccessDeniedReason(error);
  const failure = Cause.failureOption(error[Runtime.FiberFailureCauseId]);
  return Option.isSome(failure) && hasTaskInteractionAccessDeniedReason(failure.value);
};

const withAsyncIterableContext = <TValue, TContext extends InvocationContextInput>(
  context: TContext,
  withContext: <TResult>(context: TContext, run: () => TResult) => TResult,
  create: () => AsyncIterable<TValue>,
): AsyncIterable<TValue> => ({
  [Symbol.asyncIterator]() {
    const iterator = withContext(context, () => create()[Symbol.asyncIterator]());
    return {
      next: value => withContext(context, () => iterator.next(value)),
      return: value =>
        withContext(context, () =>
          iterator.return
            ? iterator.return(value)
            : Promise.resolve({ done: true as const, value }),
        ),
      throw: error =>
        withContext(context, () =>
          iterator.throw ? iterator.throw(error) : Promise.reject(error),
        ),
    };
  },
});

export const createApplicationRuntimeProtocol = <TContext extends InvocationContextInput>({
  application,
  policies,
  modelCommand,
  projectCommittedMutations,
  projectEventDelivery,
  taskInteractionActor = actorFromContext,
  reportError,
}: ApplicationRuntimeProtocolOptions<TContext>): ApplicationRuntimeProtocol<TContext> => {
  const graphReadPolicies = policies.filter(isGraphReadPolicy);
  const graphCommandPolicies = policies.filter(
    (policy): policy is ApplicationRuntimeGraphCommandPolicy<TContext> =>
      !isGraphReadPolicy(policy),
  );
  const operation = createOperationInvocationDispatcher({
    ...application,
    resolveOperation: operationId => {
      const resolved = application.resolveOperation(operationId);
      return resolved?.exposure === 'bridge' ? resolved : undefined;
    },
  });
  const read = application.createGraphReadDispatcher<TContext>(graphReadPolicies);
  const observeNativeGraph = application.createGraphReadObserver<TContext>(graphReadPolicies);
  const activeGraphObservations = createActiveGraphObservationRegistry();
  const command = application.createGraphCommandDispatcher<TContext>(graphCommandPolicies);
  const withContext = <TValue>(context: TContext, run: () => TValue) =>
    application.app.runtime.withInvocationContext(context, run);
  const withMutationJournal = <TValue>(
    scope: string,
    context: TContext,
    run: () => TValue | PromiseLike<TValue>,
  ) =>
    withContext(context, () => {
      const invocation = getCurrentInvocationContext();
      if (!invocation) throw new Error('Runtime Protocol invocation context is unavailable.');

      const resources = new Map(invocation.resources);
      const previousDelivery = resources.get(COMMITTED_MUTATION_DELIVERY_RESOURCE_KEY) as
        | CommittedMutationDelivery
        | undefined;
      const delivery: CommittedMutationDelivery = commit => {
        try {
          previousDelivery?.(commit);
        } catch (error) {
          reportError?.(error);
        }
        try {
          activeGraphObservations.publish(commit);
        } catch (error) {
          reportError?.(error);
        }
      };
      resources.set(COMMITTED_MUTATION_DELIVERY_RESOURCE_KEY, delivery);

      return withContext({ ...context, resources } as TContext, () =>
        serverContext.run(
          {
            scope,
            telemetrySpanName: scope,
            resources,
          },
          async () => {
            const unitOfWork = getRequiredUnitOfWork();
            const body = await run();
            const committedMutations = sealUnitOfWorkMutationJournal(unitOfWork);
            const commit = createCommittedMutationCommit(committedMutations);
            delivery(commit);
            return withRuntimeProtocolMetadata(
              body,
              committedMutations.mutations.length === 0
                ? undefined
                : { committedMutations, mutationCommitId: commit.id },
            );
          },
        ),
      );
    });
  const durableSnapshotResponse = (snapshot: TaskSnapshot) =>
    withRuntimeProtocolMetadata(
      toDurableOperationSnapshotResponse(snapshot),
      (snapshot.status === 'completed' ||
        snapshot.status === 'failed' ||
        snapshot.status === 'cancelled') &&
        snapshot.executionMetadata
        ? snapshot.executionMetadata
        : undefined,
    );

  const toGraphObservationResponse = (
    response: GraphReadDispatchResponse,
    causedBy?: GraphObservationRefreshCause,
  ): GraphReadObservationResponse => {
    if (isGraphReadProtocolError(response)) return response;
    if (
      response.kind !== 'graph-read-result' ||
      !Array.isArray(response.value) ||
      !isJsonValue(response.value)
    ) {
      return graphReadProtocolError(
        'execution_unavailable',
        'Data graph read execution is temporarily unavailable.',
      );
    }
    return {
      kind: 'graph-read-result',
      value: response.value,
      ...(causedBy ? { causedBy } : {}),
      ...(response.capabilities ? { capabilities: response.capabilities } : {}),
    };
  };

  const observeGraph: RuntimeProtocolGraphObserver<TContext> = (request, { context, signal }) => {
    const parsed = parseGraphReadRequest(request);
    if (!parsed.success || parsed.request.mode !== 'run') {
      return observeNativeGraph(request, { authority: context, signal });
    }

    return (async function* () {
      const subscription = activeGraphObservations.register(parsed.request);
      const nativeController = new AbortController();
      const abortNative = () => nativeController.abort(signal.reason);
      if (signal.aborted) abortNative();
      else signal.addEventListener('abort', abortNative, { once: true });
      const native = observeNativeGraph(request, {
        authority: context,
        signal: nativeController.signal,
      });
      const iterator = native[Symbol.asyncIterator]();
      let nativeNext: Promise<IteratorResult<GraphReadObservationResponse>> | undefined =
        iterator.next();
      let mutationNext = subscription.wait(signal);
      let previousSnapshot: string | undefined;

      const emitIfChanged = (body: GraphReadObservationResponse) => {
        if (body.kind !== 'graph-read-result') return body;
        const snapshot = JSON.stringify({ kind: body.kind, value: body.value });
        if (snapshot === previousSnapshot) return undefined;
        previousSnapshot = snapshot;
        return body;
      };

      try {
        while (!signal.aborted) {
          const outcome: GraphObservationRaceOutcome = await Promise.race([
            ...(nativeNext
              ? [nativeNext.then(result => ({ kind: 'native' as const, result }))]
              : []),
            mutationNext.then(causedBy => ({ kind: 'mutation' as const, causedBy })),
          ]);

          if (outcome.kind === 'native') {
            if (outcome.result.done) {
              nativeNext = undefined;
            } else {
              const nativeBody: GraphReadObservationResponse = outcome.result.value;
              const nativeUnavailable: boolean =
                isGraphReadProtocolError(nativeBody) &&
                nativeBody.error.code === 'execution_unavailable';
              nativeNext = nativeUnavailable ? undefined : iterator.next();
              const body = emitIfChanged(
                nativeUnavailable
                  ? toGraphObservationResponse(
                      await withContext(context, () => read(request, { authority: context })),
                    )
                  : nativeBody,
              );
              if (body) yield body;
            }
            continue;
          }

          if (!outcome.causedBy) return;
          mutationNext = subscription.wait(signal);
          const refreshed = await withContext(context, () => read(request, { authority: context }));
          const body = emitIfChanged(toGraphObservationResponse(refreshed, outcome.causedBy));
          if (body) yield body;
        }
      } finally {
        subscription.close();
        signal.removeEventListener('abort', abortNative);
        nativeController.abort();
        if (nativeNext) {
          try {
            await nativeNext;
          } catch {
            // The native observer may reject while cooperatively handling cancellation.
          }
        }
        await iterator.return?.();
      }
    })();
  };

  const dispatcher = createRuntimeProtocolDispatcher<TContext>({
    handlers: {
      operation: (request, context) =>
        request.kind === 'invoke'
          ? withMutationJournal('runtime.protocol.operation', context, () => operation(request))
          : withContext(context, () => operation(request)),
      'graph.read': (request, context) =>
        withContext(context, () => read(request, { authority: context })),
      'graph.command': (request, context) =>
        request.kind === 'graph-command'
          ? withMutationJournal('runtime.protocol.graph.command', context, () =>
              command(request, { authority: context }),
            )
          : withContext(context, () => command(request, { authority: context })),
      'durable.operation': (request, context) =>
        withContext(context, async () => {
          if (request.kind === 'inspect')
            return durableSnapshotResponse(await application.getTaskSnapshot(request.run));

          const actor = taskInteractionActor(context);
          if (!actor)
            return durableOperationProtocolError(
              'access_denied',
              'Authentication is required to respond to this task interaction.',
            );

          try {
            return durableSnapshotResponse(
              await application.respondToTaskInteraction(request.run, request.response, { actor }),
            );
          } catch (error) {
            if (isTaskInteractionAccessDenied(error))
              return durableOperationProtocolError(
                'access_denied',
                'The authenticated actor cannot respond to this task interaction.',
              );
            throw error;
          }
        }),
      ...(modelCommand
        ? {
            'model.command': (request, context, { signal }) =>
              withMutationJournal('runtime.protocol.model.command', context, () =>
                submitModelCommandProtocol(modelCommand.runtime, request, signal),
              ),
          }
        : {}),
    },
    projectMetadata:
      projectCommittedMutations === undefined
        ? undefined
        : async (metadata, request, context) => {
            if (
              request.family !== 'operation' &&
              request.family !== 'graph.command' &&
              request.family !== 'durable.operation' &&
              request.family !== 'model.command'
            )
              return undefined;
            const committedMutations = await projectCommittedMutations(
              metadata.committedMutations,
              { context, family: request.family },
            );
            return committedMutations === undefined
              ? undefined
              : {
                  committedMutations,
                  ...(metadata.mutationCommitId
                    ? { mutationCommitId: metadata.mutationCommitId }
                    : {}),
                };
          },
    reportError: error => reportError?.(error),
  });

  const observeEvent = (
    event: { readonly id: string; readonly version: number },
    context: TContext,
    signal: AbortSignal,
  ): AsyncIterable<EventDelivery> => ({
    [Symbol.asyncIterator]() {
      const maxQueuedDeliveries = 256;
      const queued: EventDelivery[] = [];
      let pending:
        | {
            resolve: (result: IteratorResult<EventDelivery>) => void;
            reject: (error: Error) => void;
          }
        | undefined;
      let closed = false;
      let failure: Error | undefined;
      let projection = Promise.resolve();
      const abort = () => finish();
      function finish(error?: unknown) {
        if (closed) return;
        closed = true;
        failure =
          error instanceof Error
            ? error
            : error === undefined
              ? undefined
              : new Error(String(error));
        subscription.cancel();
        signal.removeEventListener('abort', abort);
        if (failure) pending?.reject(failure);
        else pending?.resolve({ done: true, value: undefined });
        pending = undefined;
      }
      const subscription = application.events.subscribeByIdentity(
        event.id,
        event.version,
        delivery => {
          projection = projection
            .then(async () => {
              if (closed) return;
              const visible = await projectEventDelivery!(delivery, context);
              if (!visible || closed) return;
              if (pending) {
                const waiter = pending;
                pending = undefined;
                waiter.resolve({ done: false, value: visible });
              } else if (queued.length >= maxQueuedDeliveries) {
                finish(new Error('Event observation queue overflowed.'));
              } else {
                queued.push(visible);
              }
            })
            .catch(finish);
          return projection;
        },
      );
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      return {
        next: () => {
          const delivery = queued.shift();
          if (delivery) return Promise.resolve({ done: false as const, value: delivery });
          if (failure) return Promise.reject(failure);
          if (closed) return Promise.resolve({ done: true as const, value: undefined });
          return new Promise((resolve, reject) => {
            pending = { resolve, reject };
          });
        },
        return: async () => {
          finish();
          return { done: true as const, value: undefined };
        },
      };
    },
  });

  return {
    dispatcher,
    graphReadPolicies,
    graphCommandPolicies,
    observeGraph: (request, { context, signal }) =>
      withAsyncIterableContext(context, withContext, () =>
        observeGraph(request, { context, signal }),
      ),
    observeDurableOperation: createTaskRunDurableOperationObserver<TContext>({
      observe: (run, context) => withContext(context, () => application.app.task.observe(run)),
    }),
    ...(projectEventDelivery
      ? { observeEvent: (event, { context, signal }) => observeEvent(event, context, signal) }
      : {}),
  };
};
