import type { GraphSchemaLike } from '../../value/schema/definition.js';

import type {
  DomainOperationBridgeMetadata,
  DomainOperationClientCacheMetadata,
} from './client-metadata.js';
import type {
  DomainOperationAuthority,
  DomainOperationGraphOpsMetadata,
  DomainOperationIngressMetadata,
  DomainOperationReceiverDescriptor,
  DurableOperationMetadata,
  GraphEntityExposure,
} from './definition.js';
import type { DomainOperationExecutionMetadata } from './execution-policy.js';
import type { GraphOutputDescriptor } from './output.js';

export type PortableDomainOperationMetadata<
  TInput = unknown,
  TCache = unknown,
  TResult = unknown,
  TConditions = unknown,
> = {
  kind: 'domain-operation';
  authority: DomainOperationAuthority;
  exposure: Exclude<GraphEntityExposure, 'browser-direct'>;
  description?: string;
  input?: GraphSchemaLike<TInput>;
  output?: GraphSchemaLike<TResult>;
  graphOutput?: GraphOutputDescriptor;
  bridge?: DomainOperationBridgeMetadata<TInput>;
  clientCache?: DomainOperationClientCacheMetadata<TInput, TResult>;
  ingress?: ReadonlyArray<DomainOperationIngressMetadata<TInput>>;
  graphOps?: DomainOperationGraphOpsMetadata;
  receiver?: DomainOperationReceiverDescriptor;
  execution?: DomainOperationExecutionMetadata;
  conditions?: TConditions;
  cache?: TCache;
  durable?: DurableOperationMetadata<TInput, TResult>;
  implementation?: {
    selected: string;
    kind?: string;
    selection: { kind: 'static' } | { kind: 'environment-binding'; binding: string };
  };
};

export type DomainOperationImplementationMetadata = NonNullable<
  PortableDomainOperationMetadata['implementation']
>;
