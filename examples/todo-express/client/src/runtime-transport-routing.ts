import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  type DurableOperationObservationOptions,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeTransport,
  type RuntimeTransportRequestOptions,
} from '@ontahi/core/runtime/protocol';
import {
  createFetchRuntimeTransport,
  createWebSocketRuntimeTransport,
  type FetchRuntimeTransport,
  type WebSocketRuntimeTransport,
} from '@ontahi/react/graph';

export type TodoTransportName = 'http' | 'websocket';

export type TodoTransportRouting = {
  readonly graphRead: TodoTransportName;
  readonly graphCommand: TodoTransportName;
  readonly operation: TodoTransportName;
  readonly durableProgress: TodoTransportName;
};

export const defaultTodoTransportRouting: TodoTransportRouting = {
  graphRead: 'websocket',
  graphCommand: 'websocket',
  operation: 'websocket',
  durableProgress: 'websocket',
};

export const splitTodoTransportRouting: TodoTransportRouting = {
  graphRead: 'http',
  graphCommand: 'http',
  operation: 'http',
  durableProgress: 'websocket',
};

export const httpTodoTransportRouting: TodoTransportRouting = {
  graphRead: 'http',
  graphCommand: 'http',
  operation: 'http',
  durableProgress: 'http',
};

export const todoTransportRoutingStorageKey = 'ontahi.todo.runtime-transport-routing.v1';

type TodoRuntimeTransport = RuntimeTransport<never> & {
  readonly durableOperation: NonNullable<RuntimeTransport['durableOperation']>;
};

type TodoRuntimeTransportRouterOptions = {
  readonly initialRouting?: TodoTransportRouting;
  readonly http?: FetchRuntimeTransport<never>;
  readonly websocket?: WebSocketRuntimeTransport;
};

export type TodoRuntimeTransportRouter = {
  readonly transport: TodoRuntimeTransport;
  routing(): TodoTransportRouting;
  configure(routing: TodoTransportRouting): void;
  close(): void;
};

type RoutingStorage = Pick<Storage, 'getItem' | 'setItem'>;

const isTodoTransportName = (value: unknown): value is TodoTransportName =>
  value === 'http' || value === 'websocket';

const parseTodoTransportRouting = (value: unknown): TodoTransportRouting | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Partial<Record<keyof TodoTransportRouting, unknown>>;
  if (
    !isTodoTransportName(candidate.graphRead) ||
    !isTodoTransportName(candidate.graphCommand) ||
    !isTodoTransportName(candidate.operation) ||
    !isTodoTransportName(candidate.durableProgress)
  ) {
    return undefined;
  }
  return {
    graphRead: candidate.graphRead,
    graphCommand: candidate.graphCommand,
    operation: candidate.operation,
    durableProgress: candidate.durableProgress,
  };
};

export const loadTodoTransportRouting = (
  storage: Pick<RoutingStorage, 'getItem'>,
): TodoTransportRouting => {
  try {
    return (
      parseTodoTransportRouting(
        JSON.parse(storage.getItem(todoTransportRoutingStorageKey) ?? ''),
      ) ?? defaultTodoTransportRouting
    );
  } catch {
    return defaultTodoTransportRouting;
  }
};

export const saveTodoTransportRouting = (
  storage: Pick<RoutingStorage, 'setItem'>,
  routing: TodoTransportRouting,
) => {
  storage.setItem(todoTransportRoutingStorageKey, JSON.stringify(routing));
};

const routeForFamily = (
  request: RuntimeProtocolRequestEnvelope,
  routing: TodoTransportRouting,
): TodoTransportName => {
  switch (request.family) {
    case 'graph.read':
      return routing.graphRead;
    case 'graph.command':
      return routing.graphCommand;
    case 'operation':
      return routing.operation;
    case 'durable.operation':
      return routing.durableProgress;
    default:
      return 'websocket';
  }
};

export const createTodoRuntimeTransportRouter = ({
  initialRouting = defaultTodoTransportRouting,
  http = createFetchRuntimeTransport<never>(),
  websocket = createWebSocketRuntimeTransport(),
}: TodoRuntimeTransportRouterOptions = {}): TodoRuntimeTransportRouter => {
  let currentRouting = parseTodoTransportRouting(initialRouting) ?? defaultTodoTransportRouting;
  const transports = { http, websocket } as const;
  const request = (
    runtimeRequest: RuntimeProtocolRequestEnvelope,
    options?: RuntimeTransportRequestOptions<never>,
  ) => transports[routeForFamily(runtimeRequest, currentRouting)].request(runtimeRequest, options);
  const observe = <TResult>(
    run: TaskRunIdentity,
    options?: DurableOperationObservationOptions,
  ): AsyncIterable<TaskSnapshot<TResult>> =>
    transports[currentRouting.durableProgress].durableOperation.observe<TResult>(run, options);

  return {
    transport: { request, durableOperation: { observe } },
    routing: () => currentRouting,
    configure: routing => {
      currentRouting = parseTodoTransportRouting(routing) ?? defaultTodoTransportRouting;
    },
    close: () => websocket.close(),
  };
};
