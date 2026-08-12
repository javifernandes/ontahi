import 'server-only';

import {
  attachActionRuntime,
  createFeatureAllQueryTarget,
  getActionQueryKeyPrefixFromSpec,
  resolveInvalidationTarget,
  type ActionInvalidationTarget,
  type ActionQueryKey,
  type ActionQuerySpec,
} from '@ontahi/core/runtime/actions';
import {
  layer,
  runServerEffect,
  type EffectSuccessPayload,
  type LayerConcern,
  type OperationFailure,
  type OperationInput,
  type OperationRequirement,
  type OperationRuntimeError,
} from '@ontahi/core/runtime/server';
import { isRecord } from '@ontahi/core/value/object';
import type { Effect } from 'effect';
import type {
  InputSchemaFactoryFn,
  MaybeBrandThrows,
  SafeActionClient,
  SafeActionFn,
  ServerCodeFn,
} from 'next-safe-action';

import { type ActionMetadata, withActionMetadata } from './transport.js';

const toScopeSegment = (value: string) =>
  value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

type InferClientMetadata<TClient> =
  TClient extends SafeActionClient<
    any,
    any,
    any,
    infer Metadata,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >
    ? Metadata
    : never;

type InferClientCtx<TClient> =
  TClient extends SafeActionClient<any, any, any, any, any, infer Ctx, any, any, any, any, any, any>
    ? Ctx
    : object;

type InferClientInputSchema<TClient> =
  TClient extends SafeActionClient<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer InputSchema,
    any,
    any,
    any,
    any
  >
    ? InputSchema
    : undefined;

type InferClientBindArgsSchemas<TClient> =
  TClient extends SafeActionClient<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer BindArgsSchemas,
    any,
    any
  >
    ? BindArgsSchemas
    : readonly [];

type InferStandardSchemaOutput<Schema> = Schema extends {
  readonly '~standard': {
    readonly types?: {
      readonly output: infer Output;
    };
  };
}
  ? Output
  : undefined;

type InferClientParsedInput<TClient> = InferStandardSchemaOutput<InferClientInputSchema<TClient>>;

type ActionFnForClient<TClient, Data> =
  TClient extends SafeActionClient<
    infer ServerError,
    any,
    any,
    any,
    any,
    any,
    any,
    infer InputSchema,
    any,
    infer BindArgsSchemas,
    infer ShapedErrors,
    infer ThrowsValidationErrors
  >
    ? MaybeBrandThrows<
        SafeActionFn<ServerError, InputSchema, BindArgsSchemas, ShapedErrors, Data>,
        ThrowsValidationErrors
      >
    : never;

type ActionArgsForClient<TClient> = Parameters<
  ServerCodeFn<
    InferClientMetadata<TClient>,
    InferClientCtx<TClient>,
    InferClientInputSchema<TClient>,
    InferClientBindArgsSchemas<TClient>,
    unknown
  >
>[0];

type ActionInputFnForClient<TClient, Data> = (
  parsedInput: InferClientParsedInput<TClient>,
) => Data | Promise<Data>;

type MaybePromise<T> = T | Promise<T>;

type ActionOperationOptions<TClient, Data> = {
  mapInput?: (
    parsedInput: InferClientParsedInput<TClient>,
    actionArgs: ActionArgsForClient<TClient>,
  ) => unknown;
  onSuccess?: (args: {
    parsedInput: InferClientParsedInput<TClient>;
    input: unknown;
    result: Awaited<Data>;
    actionArgs: ActionArgsForClient<TClient>;
  }) => MaybePromise<unknown>;
};

type DomainOperationForClient<TClient, Data> = {
  operation: ActionInputFnForClient<TClient, Data>;
};

type CanonicalDomainOperationForClient<TClient> = {
  name: string;
  layer: string;
  run: (
    input: InferClientParsedInput<TClient>,
  ) => Effect.Effect<
    Record<string, unknown> | void | EffectSuccessPayload<Record<string, unknown> | void>,
    OperationFailure | OperationRuntimeError
  >;
  defectLogMessage?: string;
  defectPublicMessage?: string;
  extra?: (input: InferClientParsedInput<TClient>) => Record<string, unknown>;
  telemetrySpanName?: string;
  requires?: ReadonlyArray<OperationRequirement<InferClientParsedInput<TClient> & OperationInput>>;
  concerns?: ReadonlyArray<LayerConcern<InferClientParsedInput<TClient>, unknown>>;
  contracts?: unknown;
};

type AnyDomainOperationForClient<TClient, Data> =
  | DomainOperationForClient<TClient, Data>
  | CanonicalDomainOperationForClient<TClient>;

type InvalidationResolver<TInput, TData> = (args: {
  input: TInput;
  data: TData;
}) => ActionInvalidationTarget[];

type AnySafeActionClient = SafeActionClient<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

type ResolvedInputSchema<Schema> =
  Schema extends InputSchemaFactoryFn<any, infer NextSchema> ? NextSchema : Schema;

type NextClientForSchema<
  Client extends AnySafeActionClient,
  Schema extends Parameters<Client['inputSchema']>[0],
> =
  Client extends SafeActionClient<
    infer ServerError,
    infer ErrorsFormat,
    infer MetadataSchema,
    infer Metadata,
    infer HasMetadata,
    infer Ctx,
    infer InputSchemaFn,
    infer CurrentInputSchema,
    infer OutputSchema,
    infer BindArgsSchemas,
    any,
    infer ThrowsValidationErrors
  >
    ? SafeActionClient<
        ServerError,
        ErrorsFormat,
        MetadataSchema,
        Metadata,
        HasMetadata,
        Ctx,
        InputSchemaFn,
        ResolvedInputSchema<Schema>,
        OutputSchema,
        BindArgsSchemas,
        any,
        ThrowsValidationErrors
      >
    : AnySafeActionClient;

type MetadataClient<Client extends AnySafeActionClient> = ReturnType<Client['metadata']>;

type ActionBuilder<Client extends AnySafeActionClient> = {
  input: <Schema extends Parameters<Client['inputSchema']>[0]>(
    schema: Schema,
  ) => ActionBuilder<NextClientForSchema<Client, Schema>>;
  inputType: <Schema extends Parameters<Client['inputSchema']>[0]>(
    schema: Schema,
  ) => ActionBuilder<NextClientForSchema<Client, Schema>>;
  key: {
    (querySpec: ActionQuerySpec<InferClientParsedInput<Client>>): ActionBuilder<Client>;
    (getQueryKey: (input: InferClientParsedInput<Client>) => ActionQueryKey): ActionBuilder<Client>;
  };
  affects: (
    targets:
      | ActionInvalidationTarget[]
      | InvalidationResolver<InferClientParsedInput<Client>, unknown>,
  ) => ActionBuilder<Client>;
  run: <Data>(
    serverCodeFn: ServerCodeFn<
      InferClientMetadata<Client>,
      InferClientCtx<Client>,
      InferClientInputSchema<Client>,
      InferClientBindArgsSchemas<Client>,
      Data
    >,
  ) => ActionFnForClient<Client, Data>;
  runEffect: <Data>(
    effectFn: (
      parsedInput: InferClientParsedInput<Client>,
    ) => Effect.Effect<Data | EffectSuccessPayload<Data>, unknown>,
    options?: {
      scope?: string;
      telemetrySpanName?: string;
      input?: (
        parsedInput: InferClientParsedInput<Client>,
        actionArgs: ActionArgsForClient<Client>,
      ) => Record<string, unknown> | undefined;
      extra?: (
        parsedInput: InferClientParsedInput<Client>,
        actionArgs: ActionArgsForClient<Client>,
      ) => Record<string, unknown> | undefined;
    },
  ) => ActionFnForClient<Client, Data>;
  runOperation: <Data>(
    operationFn: ActionInputFnForClient<Client, Data>,
    options?: ActionOperationOptions<Client, Data>,
  ) => ActionFnForClient<Client, Data>;
  runDomainOperation: <Data>(
    operation: AnyDomainOperationForClient<Client, Data>,
    options?: ActionOperationOptions<Client, Data>,
  ) => ActionFnForClient<Client, Data>;
};

type ActionBuilderConfig<Client> = {
  querySpec?: ActionQuerySpec<InferClientParsedInput<Client>>;
  invalidationQueryKeyPrefix?: ActionQueryKey;
  getQueryKey?: (input: InferClientParsedInput<Client>) => ActionQueryKey;
  getAffects?: InvalidationResolver<InferClientParsedInput<Client>, unknown>;
};

const createActionBuilder = <Client extends AnySafeActionClient>(
  client: Client,
  metadata: ActionMetadata,
  config?: ActionBuilderConfig<Client>,
): ActionBuilder<Client> => {
  const resolveKeyConfig = (
    specOrGetQueryKey:
      | ActionQuerySpec<InferClientParsedInput<Client>>
      | ((input: InferClientParsedInput<Client>) => ActionQueryKey),
  ): Pick<
    ActionBuilderConfig<Client>,
    'querySpec' | 'invalidationQueryKeyPrefix' | 'getQueryKey'
  > => {
    if (typeof specOrGetQueryKey === 'function') {
      const getQueryKey = specOrGetQueryKey as (
        input: InferClientParsedInput<Client>,
      ) => ActionQueryKey;

      return {
        getQueryKey,
        querySpec: undefined,
        invalidationQueryKeyPrefix: undefined,
      };
    }

    return {
      getQueryKey: undefined,
      querySpec: specOrGetQueryKey,
      invalidationQueryKeyPrefix: getActionQueryKeyPrefixFromSpec(specOrGetQueryKey),
    };
  };

  const input = <Schema extends Parameters<Client['inputSchema']>[0]>(schema: Schema) => {
    const nextClient = client.inputSchema(schema);
    return createActionBuilder<typeof nextClient>(nextClient, metadata, config as any);
  };

  const inputType = <Schema extends Parameters<Client['inputSchema']>[0]>(schema: Schema) => {
    const nextClient = client.inputSchema(schema);
    return createActionBuilder<typeof nextClient>(nextClient, metadata, config as any);
  };

  function key(
    querySpec: ActionQuerySpec<InferClientParsedInput<Client>>,
  ): ReturnType<typeof createActionBuilder<Client>>;
  function key(
    getQueryKey: (input: InferClientParsedInput<Client>) => ActionQueryKey,
  ): ReturnType<typeof createActionBuilder<Client>>;
  function key(
    specOrGetQueryKey:
      | ActionQuerySpec<InferClientParsedInput<Client>>
      | ((input: InferClientParsedInput<Client>) => ActionQueryKey),
  ) {
    const nextKeyConfig = resolveKeyConfig(specOrGetQueryKey);

    return createActionBuilder(client, metadata, {
      ...config,
      ...nextKeyConfig,
    });
  }

  const affects = (
    targets:
      | ActionInvalidationTarget[]
      | InvalidationResolver<InferClientParsedInput<Client>, unknown>,
  ) =>
    createActionBuilder(client, metadata, {
      ...config,
      getAffects:
        typeof targets === 'function'
          ? (targets as InvalidationResolver<InferClientParsedInput<Client>, unknown>)
          : () => targets,
    });

  const run = <Data>(
    serverCodeFn: ServerCodeFn<
      InferClientMetadata<Client>,
      InferClientCtx<Client>,
      InferClientInputSchema<Client>,
      InferClientBindArgsSchemas<Client>,
      Data
    >,
  ): ActionFnForClient<Client, Data> =>
    attachActionRuntime(
      client.action<Data>(async actionArgs =>
        serverCodeFn(actionArgs as unknown as Parameters<typeof serverCodeFn>[0]),
      ) as ActionFnForClient<Client, Data>,
      {
        feature: metadata.feature,
        actionName: metadata.actionName,
        requiresAuth: metadata.requiresAuth ?? false,
        queryKeyPrefix: [metadata.feature, metadata.actionName] as const,
        querySpec: config?.querySpec,
        invalidationQueryKeyPrefix: config?.invalidationQueryKeyPrefix,
        getQueryKey: config?.getQueryKey as
          | ((input: InferClientParsedInput<Client>) => ActionQueryKey)
          | undefined,
        getAffectedQueryKeys: config?.getAffects
          ? args =>
              config
                .getAffects?.(args as { input: InferClientParsedInput<Client>; data: unknown })
                .flatMap(resolveInvalidationTarget) ?? []
          : undefined,
      },
    ) as unknown as ActionFnForClient<Client, Data>;

  const runEffect = <Data>(
    effectFn: (
      parsedInput: InferClientParsedInput<Client>,
    ) => Effect.Effect<Data | EffectSuccessPayload<Data>, unknown>,
    options?: {
      scope?: string;
      telemetrySpanName?: string;
      input?: (
        parsedInput: InferClientParsedInput<Client>,
        actionArgs: ActionArgsForClient<Client>,
      ) => Record<string, unknown> | undefined;
      extra?: (
        parsedInput: InferClientParsedInput<Client>,
        actionArgs: ActionArgsForClient<Client>,
      ) => Record<string, unknown> | undefined;
    },
  ) =>
    run<Data>(actionArgs => {
      const typedArgs = actionArgs as ActionArgsForClient<Client>;
      const parsedInput = typedArgs.parsedInput as InferClientParsedInput<Client>;
      const input =
        options?.input?.(parsedInput, typedArgs) ??
        (isRecord(parsedInput) ? parsedInput : undefined);
      const extra = options?.extra?.(parsedInput, typedArgs);

      return runServerEffect(effectFn(parsedInput), {
        scope:
          options?.scope ??
          `app.actions.${toScopeSegment(metadata.feature)}.${metadata.actionName}`,
        telemetrySpanName: options?.telemetrySpanName,
        input,
        extra,
      });
    });

  const runOperation = <Data>(
    operationFn: ActionInputFnForClient<Client, Data>,
    options?: ActionOperationOptions<Client, Data>,
  ): ActionFnForClient<Client, Data> =>
    run<Data>(async actionArgs => {
      const typedArgs = actionArgs as ActionArgsForClient<Client>;
      const parsedInput = typedArgs.parsedInput as InferClientParsedInput<Client>;
      const input = (options?.mapInput?.(parsedInput, typedArgs) ??
        parsedInput) as InferClientParsedInput<Client>;
      const result = await Promise.resolve(operationFn(input));

      if (options?.onSuccess) {
        await options.onSuccess({
          parsedInput,
          input,
          result: result as Awaited<Data>,
          actionArgs: typedArgs,
        });
      }

      return result;
    });

  const runDomainOperation = <Data>(
    operation: AnyDomainOperationForClient<Client, Data>,
    options?: ActionOperationOptions<Client, Data>,
  ): ActionFnForClient<Client, Data> => {
    if ('operation' in operation) {
      return runOperation(operation.operation, options);
    }

    const operationRunner = layer(operation.layer).operation(
      operation.name,
      operation.run as never,
      {
        defectLogMessage: operation.defectLogMessage,
        defectPublicMessage: operation.defectPublicMessage,
        extra: operation.extra,
        telemetrySpanName: operation.telemetrySpanName,
        requires: operation.requires,
        concerns: operation.concerns,
        contracts: operation.contracts,
      } as never,
    ) as ActionInputFnForClient<Client, Data>;

    return runOperation(operationRunner, options);
  };

  return { input, inputType, key, affects, run, runEffect, runOperation, runDomainOperation };
};

type FeatureActionsFactory = <
  PublicClient extends AnySafeActionClient,
  AuthClient extends AnySafeActionClient,
>(clients: {
  actionClient: PublicClient;
  authActionClient: AuthClient;
}) => (feature: string) => {
  ALL: ReturnType<typeof createFeatureAllQueryTarget>;
  auth: (actionName: string) => ActionBuilder<MetadataClient<AuthClient>>;
  public: (actionName: string) => ActionBuilder<MetadataClient<PublicClient>>;
};

export const createFeatureActionsFactory: FeatureActionsFactory =
  ({ actionClient, authActionClient }) =>
  (feature: string) => ({
    ALL: createFeatureAllQueryTarget(feature),
    auth: (actionName: string) =>
      createActionBuilder(
        withActionMetadata(authActionClient, {
          actionName,
          feature,
          requiresAuth: true,
        }),
        {
          actionName,
          feature,
          requiresAuth: true,
        },
      ),
    public: (actionName: string) =>
      createActionBuilder(
        withActionMetadata(actionClient, {
          actionName,
          feature,
          requiresAuth: false,
        }),
        {
          actionName,
          feature,
          requiresAuth: false,
        },
      ),
  });
