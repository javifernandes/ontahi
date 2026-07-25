import { describe, expect, it } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  field,
  graphSchema,
  type InMemoryDataset,
} from '../../../src/data-graph/index.js';
import { entity, ontahi } from '../../../src/runtime/server/index.js';

describe('ontahi application composition root', () => {
  it('binds storage, entities, operations, runtime, and reflection in one declaration', async () => {
    const Note = entity({
      name: 'Note',
      fields: {
        id: field.id(),
        title: field.string(),
      },
      locators: { byId: 'id' },
      identity: 'byId',
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'bridge',
        layer: 'notes',
      },
      operations: ({ self, commands, operation }) => ({
        list: operation({
          output: graphSchema.array(self),
          run: () => commands.all(),
        }),
      }),
    });
    const dataset: InMemoryDataset = {
      Note: [{ id: 'note-1', title: 'One root' }],
    };
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({
        entities: [Note],
        dataset,
      }),
      entities: [Note],
    });

    const operation = application.graph.getDomainOperation('Note.list');
    expect(operation).toBeDefined();
    expect(application.graph.getEntity('Note')?.entityName).toBe('Note');
    expect(application.storage.kind).toBe('in-memory');
    expect(application.storage.dataset).toBe(dataset);
    await expect(application.invokeOperation(operation!, undefined)).resolves.toMatchObject({
      ok: true,
      kind: 'success',
      value: [{ id: 'note-1', title: 'One root' }],
    });
    await expect(
      application.reflectedEntityDataReader?.readEntityData({ entityName: 'Note' }),
    ).resolves.toMatchObject({
      rows: [{ id: 'note-1', title: 'One root' }],
    });
  });
});
