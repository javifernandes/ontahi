import { Cause, Option, Runtime, type Stream } from 'effect';

import type {
  CommittedMutationSet,
  EntityMutationCommandPolicy,
  GraphReadPolicy,
  ManyToManyRelationshipCommandPolicy,
  OrderedRelationshipCommandPolicy,
  RelationshipCommandPolicy,
} from '../../data-graph/index.js';
import type { TaskActor, TaskRunIdentity, TaskSnapshot } from '../contracts.js';
import {
  createRuntimeProtocolDispatcher,
  createTaskRunDurableOperationObserver,
  durableOperationProtocolError,
  toDurableOperationSnapshotResponse,
  withRuntimeProtocolMetadata,
  type RuntimeProtocolDispatcher,
  type RuntimeProtocolDurableObserver,
  type RuntimeProtocolGraphObserver,
} from '../protocol/index.js';

import { serverContext } from './context.js';
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
import { sealCurrentUnitOfWorkMutationJournal } from './unit-of-work.js';

type RuntimeProtocolApplication = GraphReadableOntahiApplication &
  GraphObservableOntahiApplication &
  GraphCommandableOntahiApplication & {
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
      readonly family: 'operation' | 'graph.command' | 'durable.operation';
    },
  ) => CommittedMutationSet | undefined | PromiseLike<CommittedMutationSet | undefined>;
  /** Returning null denies an Interaction response. Authenticated principals are mapped by default. */
  readonly taskInteractionActor?: (context: TContext) => TaskActor | null;
  readonly reportError?: (error: unknown) => void;
};

export type ApplicationRuntimeProtocol<TContext> = {
  readonly dispatcher: RuntimeProtocolDispatcher<TContext>;
  readonly observeDurableOperation: RuntimeProtocolDurableObserver<TContext>;
  readonly observeGraph: RuntimeProtocolGraphObserver<TContext>;
  readonly graphReadPolicies: readonly GraphReadPolicy<any, TContext>[];
  readonly graphCommandPolicies: readonly ApplicationRuntimeGraphCommandPolicy<TContext>[];
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
  taskInteractionActor = actorFromContext,
  reportError,
}: ApplicationRuntimeProtocolOptions<TContext>): ApplicationRuntimeProtocol<TContext> => {
  const graphReadPolicies = policies.filter(isGraphReadPolicy);
  const graphCommandPolicies = policies.filter(
    (policy): policy is ApplicationRuntimeGraphCommandPolicy<TContext> =>
      !isGraphReadPolicy(policy),
  );
  const operation = createOperationInvocationDispatcher(application);
  const read = application.createGraphReadDispatcher<TContext>(graphReadPolicies);
  const observeGraph = application.createGraphReadObserver<TContext>(graphReadPolicies);
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

      return serverContext.run(
        {
          scope,
          telemetrySpanName: scope,
          resources: invocation.resources,
        },
        async () => {
          const body = await run();
          const committedMutations = sealCurrentUnitOfWorkMutationJournal();
          return withRuntimeProtocolMetadata(
            body,
            committedMutations.mutations.length === 0 ? undefined : { committedMutations },
          );
        },
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
              withContext(context, () =>
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
              request.family !== 'durable.operation'
            )
              return undefined;
            const committedMutations = await projectCommittedMutations(
              metadata.committedMutations,
              { context, family: request.family },
            );
            return committedMutations === undefined ? undefined : { committedMutations };
          },
    reportError: error => reportError?.(error),
  });

  return {
    dispatcher,
    graphReadPolicies,
    graphCommandPolicies,
    observeGraph: (request, { context, signal }) =>
      withAsyncIterableContext(context, withContext, () =>
        observeGraph(request, { authority: context, signal }),
      ),
    observeDurableOperation: createTaskRunDurableOperationObserver<TContext>({
      observe: (run, context) => withContext(context, () => application.app.task.observe(run)),
    }),
  };
};
