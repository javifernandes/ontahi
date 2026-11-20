import type { GraphSchemaLike } from '../../value/schema/definition.js';

import type {
  DomainOperationBridgeMetadata,
  DomainOperationClientCacheMetadata,
} from './client-metadata.js';
import type {
  DomainOperationAuthority,
  DomainOperationGraphOpsMetadata,
  DomainOperationIngressMetadata,
  DomainOperationReceiverDeclaration,
  DomainOperationReceiverDescriptor,
  DurableOperationDeclarationMetadata,
  DurableOperationDefaults,
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

export type PortableDomainOperationDefaults<TInput = unknown, TCache = unknown> = Partial<
  Pick<PortableDomainOperationMetadata<TInput, TCache>, 'authority' | 'exposure' | 'bridge'>
> & {
  layer?: string;
  durable?: DurableOperationDefaults;
};

export type PortableDomainOperationDeclarationMetadata<
  TInput = unknown,
  TCache = unknown,
  TResult = unknown,
  TConditions = unknown,
> = Omit<
  PortableDomainOperationMetadata<TInput, TCache, TResult, TConditions>,
  'authority' | 'exposure' | 'bridge' | 'durable' | 'receiver'
> &
  Partial<
    Pick<
      PortableDomainOperationMetadata<TInput, TCache, TResult, TConditions>,
      'authority' | 'exposure' | 'bridge'
    >
  > & {
    ingress?: ReadonlyArray<DomainOperationIngressMetadata<TInput>>;
    durable?: DurableOperationDeclarationMetadata<TInput, TResult>;
    receiver?: DomainOperationReceiverDeclaration | DomainOperationReceiverDescriptor;
  };

export const definePortableDomainOperationMetadata = <
  TInput,
  TCache = unknown,
  TResult = unknown,
  TConditions = unknown,
>(
  operation: Omit<
    PortableDomainOperationDeclarationMetadata<TInput, TCache, TResult, TConditions>,
    'kind'
  >,
): PortableDomainOperationDeclarationMetadata<TInput, TCache, TResult, TConditions> => ({
  kind: 'domain-operation',
  authority: 'server',
  ...operation,
});
