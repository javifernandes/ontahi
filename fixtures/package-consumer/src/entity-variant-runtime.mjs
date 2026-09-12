import {
  createEntityIdentityRef,
  createEntityRef,
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
