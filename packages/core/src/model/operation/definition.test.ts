import { expectTypeOf, it } from 'vitest';

import type {
  DomainOperationReceiverDeclaration,
  DurableOperationMetadata,
  HttpIngressMetadata,
} from './definition.js';

it('keeps operation declaration vocabulary independent from execution machinery', () => {
  expectTypeOf<DomainOperationReceiverDeclaration>().toMatchTypeOf<
    { kind: 'input'; path: string } | { kind: 'entity-type'; entity: object }
  >();
  expectTypeOf<HttpIngressMetadata>().toHaveProperty('route');
  expectTypeOf<DurableOperationMetadata>().toHaveProperty('runtime');
});
