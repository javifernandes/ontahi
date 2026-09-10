import { isRecord } from '@ontahi/core';
import {
  createRuntimeProtocolResponse,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';

/** Keep data-execution spies separate from automatic metadata traffic in non-policy UI tests. */
export const withConsoleMetadata = (
  request: RuntimeTransport<any>['request'],
): RuntimeTransport<any> => ({
  request: async (envelope, options) => {
    const body = envelope.body;
    if (
      isRecord(body) &&
      body.kind === 'graph-read-capabilities' &&
      typeof body.entityName === 'string'
    )
      return createRuntimeProtocolResponse(envelope, {
        kind: 'graph-read-capabilities-result',
        entityName: body.entityName,
        capabilities: { orderBy: [] },
      });
    return request(envelope, options);
  },
});
