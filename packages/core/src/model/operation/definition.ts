import type { GraphSchemaLike } from '../../value/schema/definition.js';
import type { AnyEntityDefinition } from '../entity/definition.js';
import type { RelationKind } from '../relation/definition.js';

export type GraphEntityExposure = 'browser-direct' | 'bridge' | 'server-only';
export type GraphOperationAuthority = 'client-safe' | 'server-required';
export type DomainOperationAuthority = 'server';
export type DurableOperationRuntime = string;
export type DurableOperationIdempotencyPolicy =
  | 'allow-concurrent'
  | 'reuse-running'
  | 'skip-if-completed'
  | 'replace-running'
  | 'queue-after-current';

export type OperationInputRefPathStepMetadata = {
  name: string;
  entityName: string;
  sourceField: string;
  locator?: string;
  relation?: string;
  role?: string;
  cardinality?: RelationKind;
  optional?: boolean;
};

export type OperationInputRefPathMetadata = {
  kind: 'relation-path';
  steps: readonly OperationInputRefPathStepMetadata[];
};

export type OperationInputRefLocatorGraphOpsMetadata = {
  path?: OperationInputRefPathMetadata;
};

export type OperationInputRefGraphOpsMetadata = {
  locators?: Record<string, OperationInputRefLocatorGraphOpsMetadata>;
};

export type DomainOperationGraphOpsMetadata = {
  inputRefs?: Record<string, OperationInputRefGraphOpsMetadata>;
};

export type DomainOperationReceiverDeclaration =
  | { kind: 'entity-type'; entity: AnyEntityDefinition }
  | { kind: 'input'; path: string };

export type DomainOperationReceiverDescriptor =
  | { kind: 'entity-type'; entityName: string; source: 'declaration' }
  | {
      kind: 'input';
      path: string;
      entityName: string;
      participant: 'ref';
      requirement: 'portable' | 'existing';
      source: 'declaration';
    };

export type HttpIngressMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type HttpIngressMetadata<TPayload = unknown, TInput = unknown> = {
  kind: 'http';
  method: HttpIngressMethod;
  route: string;
  provider?: string;
  channel?: string;
  body?: TPayload;
  map?: (payload: TPayload) => TInput;
};

export type DomainOperationIngressMetadata<TInput = unknown> = HttpIngressMetadata<any, TInput>;

export type DurableOperationSubject = {
  type: string;
  id: string;
};

export type DurableOperationTrigger = {
  cause: 'user_request' | 'schedule' | 'external_event' | 'internal_task' | 'system';
  actor?: {
    kind: 'user' | 'integration' | 'service' | 'system';
    id?: string;
  };
  ingress?: {
    kind: 'server_action' | 'http' | 'websocket' | 'cron' | 'queue' | 'workflow' | 'cli';
    requestId?: string;
    deliveryId?: string;
    connectionId?: string;
    scheduleId?: string;
    parentRunId?: string;
  };
  source?: {
    provider?: string;
    event?: string;
  };
};

export type DurableOperationStepDefinitionLike<TInput = unknown, TResult = unknown> = {
  id: string;
  input?: GraphSchemaLike<TInput>;
  output?: GraphSchemaLike<TResult>;
};

export type DurableOperationIdempotencyMetadata<TInput = unknown> = {
  policy: DurableOperationIdempotencyPolicy;
  key?: (input: TInput) => string | readonly unknown[];
};

export type DurableExternalEffectMetadata =
  | { readonly id: string; readonly replay: 'provider-idempotency'; readonly retryWindowMs: number }
  | { readonly id?: string; readonly replay: 'external-reference-reconciliation' };

export type DurableOperationMetadata<TInput = unknown, TResult = unknown> = {
  runtime: DurableOperationRuntime;
  taskId?: string;
  progress?: GraphSchemaLike<any>;
  finalOutput?: GraphSchemaLike<TResult>;
  subject?: (input: TInput) => DurableOperationSubject;
  trigger?: DurableOperationTrigger | ((input: TInput) => DurableOperationTrigger);
  source?: DurableOperationTrigger['source'];
  steps?: ReadonlyArray<DurableOperationStepDefinitionLike<any, any>>;
  idempotency?: DurableOperationIdempotencyMetadata<TInput>;
  externalEffects?: readonly DurableExternalEffectMetadata[];
};

export type DurableOperationDefaults = Partial<Pick<DurableOperationMetadata<any, any>, 'runtime'>>;

export type DurableOperationDeclarationMetadata<TInput = unknown, TResult = unknown> = Omit<
  DurableOperationMetadata<TInput, TResult>,
  'runtime'
> &
  Partial<Pick<DurableOperationMetadata<TInput, TResult>, 'runtime'>>;
