import type { RuntimeProtocolRequestEnvelope } from './envelope.js';
import {
  isRuntimeProtocolFamily,
  runtimeProtocolFamilyNames,
  type RuntimeProtocolFamily,
} from './families.js';
import type { RuntimeTransport, RuntimeTransportRequestOptions } from './transport.js';

export type RuntimeTransportCapability =
  | RuntimeProtocolFamily
  | 'durable.operation.observe'
  | 'graph.observe';

export type RuntimeTransportRouting = Readonly<Partial<Record<RuntimeTransportCapability, string>>>;

export type RuntimeTransportRegistration = {
  readonly id: string;
  readonly capabilities: readonly RuntimeTransportCapability[];
};

export type RuntimeTransportRoutingSnapshot = {
  readonly assignments: RuntimeTransportRouting;
  readonly transports: readonly RuntimeTransportRegistration[];
};

export type ConfigurableRuntimeTransport<TTransportOptions = unknown> =
  RuntimeTransport<TTransportOptions> & {
    readonly routing: {
      inspect(): RuntimeTransportRoutingSnapshot;
      subscribe(listener: () => void): () => void;
      configure(capability: RuntimeTransportCapability, transportId: string): void;
    };
  };

type AnyRuntimeTransport = RuntimeTransport<any>;

type RuntimeTransportOptionsOf<TTransport> =
  TTransport extends RuntimeTransport<infer TTransportOptions> ? TTransportOptions : never;

export type RuntimeTransportRouterOptions<
  TTransports extends Readonly<Record<string, AnyRuntimeTransport>>,
> = {
  readonly transports: TTransports;
  readonly routing?: Partial<
    Record<RuntimeTransportCapability, Extract<keyof TTransports, string>>
  >;
};

type RegisteredRuntimeTransport = RuntimeTransportRegistration & {
  readonly transport: AnyRuntimeTransport;
};

const observationCapabilities = [
  'durable.operation.observe',
  'graph.observe',
] as const satisfies readonly RuntimeTransportCapability[];

const runtimeTransportCapabilities = (
  transport: AnyRuntimeTransport,
): readonly RuntimeTransportCapability[] => [
  ...runtimeProtocolFamilyNames,
  ...(transport.durableOperation ? (['durable.operation.observe'] as const) : []),
  ...(transport.graph ? (['graph.observe'] as const) : []),
];

const isRuntimeTransportCapability = (value: unknown): value is RuntimeTransportCapability =>
  isRuntimeProtocolFamily(value) ||
  observationCapabilities.includes(value as (typeof observationCapabilities)[number]);

const frozenSnapshot = (
  assignments: RuntimeTransportRouting,
  transports: readonly RegisteredRuntimeTransport[],
): RuntimeTransportRoutingSnapshot =>
  Object.freeze({
    assignments: Object.freeze({ ...assignments }),
    transports: Object.freeze(
      transports.map(({ id, capabilities }) =>
        Object.freeze({ id, capabilities: Object.freeze([...capabilities]) }),
      ),
    ),
  });

export const isConfigurableRuntimeTransport = <TTransportOptions>(
  transport: RuntimeTransport<TTransportOptions>,
): transport is ConfigurableRuntimeTransport<TTransportOptions> => {
  const routing = (
    transport as RuntimeTransport<TTransportOptions> & {
      readonly routing?: Partial<ConfigurableRuntimeTransport<TTransportOptions>['routing']>;
    }
  ).routing;
  return (
    typeof routing === 'object' &&
    routing !== null &&
    typeof routing.inspect === 'function' &&
    typeof routing.subscribe === 'function' &&
    typeof routing.configure === 'function'
  );
};

export const createRuntimeTransportRouter = <
  const TTransports extends Readonly<Record<string, AnyRuntimeTransport>>,
>({
  transports: configuredTransports,
  routing: configuredRouting = {},
}: RuntimeTransportRouterOptions<TTransports>): ConfigurableRuntimeTransport<
  RuntimeTransportOptionsOf<TTransports[keyof TTransports]>
> => {
  const transports = Object.entries(configuredTransports).map<RegisteredRuntimeTransport>(
    ([id, transport]) => ({ id, transport, capabilities: runtimeTransportCapabilities(transport) }),
  );
  if (transports.length === 0) {
    throw new TypeError('Runtime Transport router requires at least one transport.');
  }
  if (transports.some(({ id }) => id.trim().length === 0)) {
    throw new TypeError('Runtime Transport ids must be non-empty strings.');
  }

  const transportById = new Map(transports.map(transport => [transport.id, transport]));
  const availableCapabilities = [
    ...runtimeProtocolFamilyNames,
    ...observationCapabilities.filter(capability =>
      transports.some(transport => transport.capabilities.includes(capability)),
    ),
  ];
  let assignments: RuntimeTransportRouting = {};
  const listeners = new Set<() => void>();

  const assignedTransport = (capability: RuntimeTransportCapability, transportId: string) => {
    const registered = transportById.get(transportId);
    if (!registered) {
      throw new TypeError(`Runtime transport "${transportId}" is not registered.`);
    }
    if (!registered.capabilities.includes(capability)) {
      throw new TypeError(
        `Transport "${transportId}" does not support Runtime capability "${capability}".`,
      );
    }
    return registered.transport;
  };

  for (const [capability, transportId] of Object.entries(configuredRouting)) {
    if (!isRuntimeTransportCapability(capability)) {
      throw new TypeError(`Unknown Runtime transport capability "${capability}".`);
    }
    assignedTransport(capability, String(transportId));
  }
  const relatedCapability: Partial<Record<RuntimeTransportCapability, RuntimeTransportCapability>> =
    {
      'durable.operation': 'durable.operation.observe',
      'durable.operation.observe': 'durable.operation',
      'graph.read': 'graph.observe',
      'graph.observe': 'graph.read',
    };
  for (const capability of availableCapabilities) {
    const configuredTransportId = configuredRouting[capability];
    const related = relatedCapability[capability];
    const relatedTransportId = related ? configuredRouting[related] : undefined;
    const preferredTransportId = configuredTransportId ?? relatedTransportId;
    const transportId =
      (preferredTransportId &&
      transportById.get(preferredTransportId)?.capabilities.includes(capability)
        ? preferredTransportId
        : undefined) ??
      transports.find(transport => transport.capabilities.includes(capability))!.id;
    assignedTransport(capability, transportId);
    assignments = { ...assignments, [capability]: transportId };
  }

  let snapshot = frozenSnapshot(assignments, transports);
  const transportFor = (capability: RuntimeTransportCapability) =>
    assignedTransport(capability, assignments[capability]!);
  const request = async (
    runtimeRequest: RuntimeProtocolRequestEnvelope,
    options?: RuntimeTransportRequestOptions<any>,
  ) => {
    if (!isRuntimeProtocolFamily(runtimeRequest.family)) {
      throw new TypeError(
        `No Runtime Transport route is configured for protocol family "${runtimeRequest.family}".`,
      );
    }
    return transportFor(runtimeRequest.family).request(runtimeRequest, options);
  };
  const durableOperation = availableCapabilities.includes('durable.operation.observe')
    ? {
        observe: <TResult>(
          ...args: Parameters<NonNullable<RuntimeTransport['durableOperation']>['observe']>
        ) => transportFor('durable.operation.observe').durableOperation!.observe<TResult>(...args),
      }
    : undefined;
  const graph = availableCapabilities.includes('graph.observe')
    ? {
        observe: (...args: Parameters<NonNullable<RuntimeTransport['graph']>['observe']>) =>
          transportFor('graph.observe').graph!.observe(...args),
      }
    : undefined;

  return {
    request,
    ...(durableOperation ? { durableOperation } : {}),
    ...(graph ? { graph } : {}),
    routing: {
      inspect: () => snapshot,
      subscribe: listener => {
        listeners.add(listener);
        let subscribed = true;
        return () => {
          if (!subscribed) return;
          subscribed = false;
          listeners.delete(listener);
        };
      },
      configure: (capability, transportId) => {
        if (!isRuntimeTransportCapability(capability)) {
          throw new TypeError(`Unknown Runtime transport capability "${String(capability)}".`);
        }
        assignedTransport(capability, transportId);
        if (assignments[capability] === transportId) return;
        assignments = { ...assignments, [capability]: transportId };
        snapshot = frozenSnapshot(assignments, transports);
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch {
            // Routing observers must not affect the caller or peer observers.
          }
        }
      },
    },
  } as ConfigurableRuntimeTransport<RuntimeTransportOptionsOf<TTransports[keyof TTransports]>>;
};
