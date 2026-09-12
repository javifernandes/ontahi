import {
  contextualSelectionFactory,
  createInMemoryDataGraphStorage,
  createRemoteDataGraphRuntime,
  toGraphReadRequestV2,
  entity as graphEntity,
  parseGraphSchema,
  Selection,
  field,
  graphSchema,
  withContextualSelections,
  withSelectionFactories,
} from '@ontahi/core/data-graph';
import { ontahi } from '@ontahi/core/runtime/server';
import { Effect } from 'effect';
import { compilePostgresQuery } from '@ontahi/postgres';
import {
  analyzeConsoleDocument,
  completeConsoleDocument,
  convertConsoleDocument,
  reflectSelectionLanguageEntity,
} from '@ontahi/language';

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
const factoryStorage = createInMemoryDataGraphStorage({
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
const factoryRuntime = factoryStorage.createRuntime();
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

const application = ontahi({ storage: factoryStorage, entities: { FactoryList, FactoryItem } });
const dispatch = application.createGraphReadDispatcher([
  {
    entity: FactoryList,
    modes: ['run'],
    cardinalities: ['many'],
    maxLimit: 25,
    fields: { id: { filter: ['eq'] } },
    selectionRelations: ['items'],
    scope: () => Selection.where(FactoryList, list => list.id.eq('l1')),
  },
  {
    entity: FactoryItem,
    modes: ['run'],
    cardinalities: ['many'],
    maxLimit: 25,
    fields: {
      id: { select: true },
      listId: { select: true },
      done: { select: true, filter: ['eq'] },
    },
    scope: 'all',
  },
]);
const wire = JSON.parse(
  JSON.stringify(
    toGraphReadRequestV2(pendingItems.from(Selection.all(FactoryList)).toQuery(), 'run'),
  ),
);
const remote = await dispatch(wire, { authority: undefined });
if (
  remote.kind !== 'graph-read-result' ||
  JSON.stringify(remote.value) !== JSON.stringify(factoryRows)
)
  throw new Error('Packed v2 receiver lost contextual authority or membership.');

const requests = [];
const clientRuntime = createRemoteDataGraphRuntime({
  transport: async request => {
    requests.push([request.kind, request.version]);
    return dispatch(JSON.parse(JSON.stringify(request)), { authority: undefined });
  },
});
const negotiatedRows = await Effect.runPromise(
  clientRuntime.run(Selection.all(Lists).pending.toQuery(), undefined),
);
if (
  JSON.stringify(negotiatedRows) !== JSON.stringify(factoryRows) ||
  JSON.stringify(requests) !==
    JSON.stringify([
      ['graph-read-capabilities', 1],
      ['graph-read', 2],
    ])
)
  throw new Error(
    'Packed client failed contextual capability negotiation and application execution.',
  );

const languageApplication = {
  entities: [Lists, FactoryItem].map(entity => reflectSelectionLanguageEntity(entity)),
};
const source = 'FactoryList.by({ id: "l1" }).where(id = "l1").pending.where(done = false).many()';
const analysis = analyzeConsoleDocument(source, languageApplication);
const declarative = convertConsoleDocument(source, languageApplication, 'declarative');
if (
  !analysis.request ||
  !declarative ||
  JSON.stringify(
    analyzeConsoleDocument(declarative, languageApplication, { dialect: 'declarative' }).request,
  ) !== JSON.stringify(analysis.request)
)
  throw new Error('Packed language lost contextual navigation while switching dialects.');
const completionSource = 'FactoryList through ';
if (
  !completeConsoleDocument(completionSource, completionSource.length, languageApplication, {
    dialect: 'declarative',
  }).items.some(item => item.label === 'pending')
)
  throw new Error('Packed language lost contextual completion.');
const consoleResult = await dispatch(analysis.request, { authority: undefined });
if (
  consoleResult.kind !== 'graph-read-result' ||
  JSON.stringify(consoleResult.value) !== JSON.stringify(factoryRows)
)
  throw new Error('Packed Console request lost deferred contextual membership.');

const excludedSource = source.replace('where(id = "l1")', 'where(id = "l2")');
const excluded = analyzeConsoleDocument(excludedSource, languageApplication);
if (!excluded.request)
  throw new Error('Packed Console failed to compile intersected source filters.');
const excludedResult = await dispatch(excluded.request, { authority: undefined });
if (excludedResult.kind !== 'graph-read-result' || JSON.stringify(excludedResult.value) !== '[]')
  throw new Error('Packed Console dropped a contradictory source filter before navigation.');
