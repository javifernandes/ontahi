import {
  createEntityRef,
  defineClientDomainOperation,
  defineClientEntity,
  entity,
  field,
  graphSchema,
  value,
} from '@ontahi/core/data-graph';
import { expect, it } from 'vitest';

import { getOperationQueryKey } from './operation-hooks.js';

it('accepts portable reference inputs when constructing schema-native query keys', () => {
  const Run = entity('Run', { taskId: field.string(), runId: field.string() })
    .locators({ byRun: ['taskId', 'runId'] })
    .identity('byRun');
  const Client = defineClientEntity(Run, {
    domainOperations: {
      inspect: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        input: value('InspectRun', { run: graphSchema.ref(Run) }),
        output: field.string(),
        bridge: {
          query: [
            (input: { run: { locator: Record<string, unknown> } }) => input.run.locator.runId,
          ],
        },
      }),
    },
  });
  expect(
    getOperationQueryKey(Client.domain.inspect, {
      run: createEntityRef(Run, { taskId: 'import', runId: 'run-1' }),
    }),
  ).toEqual(['Run', 'inspect', 'run-1']);
});
