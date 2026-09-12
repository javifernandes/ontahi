import {
  createEntityIdentityRef,
  createEntityRef,
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  defineGraphApi,
  entity,
  field,
  graphSchema,
  Selection,
  toGraphSchemaDescriptor,
} from '@ontahi/core/data-graph';
import {
  defineDomainOperation,
  defineDomainOperationsForEntity,
  runServerDomainOperationRaw,
} from '@ontahi/core/runtime/server';
import {
  analyzeConsoleDocument,
  completeConsoleDocument,
  reflectConsoleApplicationVariants,
  reflectSelectionLanguageEntity,
} from '@ontahi/language';
import { Effect } from 'effect';

const Node = entity('PackedNode', {
  id: field.id(),
  type: field.enum(['part', 'chapter']),
  title: field.string(),
});
const Chapter = Node.variant('Chapter', { discriminator: { type: 'chapter' } });
const runtime = createInMemoryDataGraphRuntime({
  entities: [Node],
  dataset: {
    PackedNode: [
      { id: 'part', type: 'part', title: 'Other' },
      { id: 'intro', type: 'chapter', title: 'Intro' },
      { id: 'end', type: 'chapter', title: 'Other' },
    ],
  },
});
const selected = Chapter.where(node => node.title.eq('Intro')).not();
const rows = await Effect.runPromise(runtime.run(selected.many(), undefined));
if (rows.length !== 1 || rows[0].id !== 'end')
  throw new Error('Packed variant complement escaped its classified universe.');
const identity = createEntityIdentityRef(Chapter.base, rows[0]);
if (JSON.stringify(identity) !== JSON.stringify(createEntityRef(Node, { id: 'end' })))
  throw new Error('Packed variant read created a different identity namespace.');
const wrong = await Effect.runPromise(
  runtime.run(Chapter.references([createEntityRef(Node, { id: 'part' })]).many(), undefined),
);
if (wrong.length !== 0) throw new Error('Packed variant treated a base ref as membership proof.');

const dispatch = createGraphReadDispatcher({
  policies: [
    {
      entity: Node,
      variants: [Chapter],
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 25,
      scope: 'all',
      fields: {
        id: { select: true },
        type: { select: true },
        title: { select: true, filter: ['eq'], order: true },
      },
    },
  ],
  execute: query => Effect.runPromise(runtime.run(query, undefined)),
});
const metadata = await dispatch(
  { version: 1, kind: 'graph-read-capabilities', entityName: Node.name },
  { authority: undefined },
);
if (metadata.kind !== 'graph-read-capabilities-result')
  throw new Error('Packed variant metadata unavailable.');
const application = reflectConsoleApplicationVariants(
  [reflectSelectionLanguageEntity(Node)],
  JSON.parse(JSON.stringify(metadata.capabilities.variants)),
);
for (const dialect of ['ts', 'declarative']) {
  if (
    !completeConsoleDocument('Chap', 4, application, { dialect }).items.some(
      item => item.label === 'Chapter',
    )
  )
    throw new Error('Packed Console did not discover the classified root.');
  const source =
    dialect === 'ts'
      ? 'Chapter.where(not title = "Intro").many()'
      : 'Chapter where not title = "Intro" many';
  const analysis = analyzeConsoleDocument(source, application, { dialect });
  const result = await dispatch(JSON.parse(JSON.stringify(analysis.request)), {
    authority: undefined,
  });
  if (
    result.kind !== 'graph-read-result' ||
    result.value.length !== 1 ||
    result.value[0].id !== 'end'
  )
    throw new Error('Packed Console variant read escaped receiver classification.');
}

const chapterInput = graphSchema
  .existingRef(Chapter)
  .resolveWith(ref => runtime.get(Selection.references(Node, [ref]).toQuery(), undefined));
const descriptor = toGraphSchemaDescriptor(chapterInput);
if (descriptor.entityName !== 'PackedNode' || descriptor.variant?.name !== 'Chapter')
  throw new Error('Packed variant input lost its canonical reflected contract.');
const inspect = defineDomainOperationsForEntity(
  Node,
  {
    inspect: defineDomainOperation({
      input: graphSchema.object({ chapter: chapterInput }),
      run: ({ chapter }) => Effect.succeed(chapter.type),
    }),
  },
  { exposure: 'server-only', layer: 'packed.variant-ref' },
).inspect;
const discovery = defineGraphApi({
  entities: { Node: { ...Node, domain: { inspect } } },
}).describe();
if (discovery.domainOperations[0]?.input?.fields?.chapter?.variant?.name !== 'Chapter')
  throw new Error('Packed graph discovery lost the classified Operation input.');
for (const [id, expected] of [
  ['intro', true],
  ['part', false],
]) {
  const result = await runServerDomainOperationRaw(inspect, {
    chapter: createEntityRef(Node, { id }),
  });
  if (result.success !== expected)
    throw new Error('Packed variant input failed receiver-owned classification.');
}
