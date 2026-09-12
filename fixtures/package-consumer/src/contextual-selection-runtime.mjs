import {
  contextualSelectionFactory,
  createInMemoryDataGraphRuntime,
  entity as graphEntity,
  parseGraphSchema,
  Selection,
  field,
  graphSchema,
  withContextualSelections,
  withSelectionFactories,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import { compilePostgresQuery } from '@ontahi/postgres';

const FactoryItem = graphEntity('FactoryItem', {
  id: field.id(),
  listId: field.string(),
  done: field.boolean(),
});
const FactoryList = graphEntity('FactoryList', { id: field.id() }).hasMany('items', FactoryItem, {
  via: 'listId',
});
const pendingItems = contextualSelectionFactory(FactoryList, 'items', item => item.done.eq(false));
const factorySelection = pendingItems.from(Selection.where(FactoryList, list => list.id.eq('l1')));
const factorySchema = graphSchema.selection(FactoryItem, { entities: [FactoryList] });
const hydratedFactorySelection = parseGraphSchema(
  factorySchema,
  JSON.parse(JSON.stringify(factorySelection)),
);
const factoryRuntime = createInMemoryDataGraphRuntime({
  entities: [FactoryList],
  dataset: {
    FactoryList: [{ id: 'l1' }, { id: 'l2' }],
    FactoryItem: [
      { id: 'i1', listId: 'l1', done: false },
      { id: 'i2', listId: 'l2', done: false },
      { id: 'i3', listId: 'l1', done: true },
    ],
  },
});
const factoryRows = await Effect.runPromise(
  factoryRuntime.run(hydratedFactorySelection.toQuery(), undefined),
);
const Lists = withSelectionFactories(
  withContextualSelections(FactoryList, ({ self }) => ({
    pending: self.items.where(item => item.done.eq(false)),
  })),
  {
    id: {
      version: 1,
      input: graphSchema.object({ id: field.id() }),
      scalarInput: 'id',
      template: { kind: 'identity', bindings: { id: 'id' } },
    },
  },
);
const namedRows = await Effect.runPromise(
  factoryRuntime.run(Lists.by({ id: 'l1' }).pending.toQuery(), undefined),
);
if (JSON.stringify(namedRows) !== JSON.stringify(factoryRows))
  throw new Error('Packed contextual Selection properties lost membership.');
if (factoryRows.length !== 1 || factoryRows[0].id !== 'i1') {
  throw new Error('Packed Core failed contextual Selection round-trip and execution.');
}

const itemMapping = {
  entity: FactoryItem,
  table: 'factory_items',
  columns: { id: 'id', listId: 'list_id', done: 'done' },
};
const compiled = compilePostgresQuery(factorySelection.toQuery(), undefined, itemMapping, {
  selectionMappings: [
    itemMapping,
    { entity: FactoryList, table: 'factory_lists', columns: { id: 'id' } },
  ],
});
if (
  !compiled.text.includes('EXISTS (SELECT 1') ||
  JSON.stringify(compiled.values) !== JSON.stringify(['l1', false])
) {
  throw new Error('Packed PostgreSQL lost contextual membership or its parameter values.');
}
