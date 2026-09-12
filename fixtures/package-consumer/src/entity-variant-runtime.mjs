import {
  createEntityIdentityRef,
  createEntityRef,
  createGraphReadDispatcher,
  createGraphClientCache,
  createInMemoryDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  defineGraphApi,
  entity,
  field,
  graphSchema,
  Selection,
  reconcileGraphReadSnapshot,
  toGraphSchemaDescriptor,
  withContextualSelections,
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

const bound = createRuntimeBoundDataGraphApi(() => runtime).bindVariantSelection(selected);
const boundRows = await Effect.runPromise(bound.limit(1).run());
if (boundRows[0]?.id !== 'end' || 'update' in bound || 'delete' in bound)
  throw new Error('Packed runtime binding lost classified read-only membership.');
if (!(await Effect.runPromise(bound.exists().run())))
  throw new Error('Packed classified exists intent did not execute.');
const cache = createGraphClientCache();
const snapshot = reconcileGraphReadSnapshot(cache, bound.toQuery(), undefined, boundRows);
if (JSON.stringify(snapshot.writes[0]?.ref) !== JSON.stringify(identity))
  throw new Error('Packed bound variant snapshot did not use canonical base identity.');

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

const TreeBase = entity('TreeNode', {
  id: field.id(),
  parentId: field.nullable(field.string()),
  forestId: field.string(),
  type: field.enum(['branch', 'leaf']),
});
const Leaf = TreeBase.variant('Leaf', { discriminator: { type: 'leaf' } });
const Tree = withContextualSelections(
  TreeBase.hasMany('children', TreeBase, { via: 'parentId' }),
  ({ self }) => ({ leaves: self.children.as(Leaf) }),
);
const Branch = Tree.variant('Branch', { discriminator: { type: 'branch' } });
const Forest = withContextualSelections(
  entity('Forest', { id: field.id() }).hasMany('nodes', Tree, { via: 'forestId' }),
  ({ self }) => ({ branches: self.nodes.as(Branch) }),
);
const treeRuntime = createInMemoryDataGraphRuntime({
  entities: [Forest, Tree],
  dataset: {
    Forest: [{ id: 'forest' }],
    TreeNode: [
      { id: 'branch', parentId: null, forestId: 'forest', type: 'branch' },
      { id: 'leaf', parentId: 'branch', forestId: 'forest', type: 'leaf' },
      { id: 'wrong-child', parentId: 'branch', forestId: 'forest', type: 'branch' },
    ],
  },
});
const leafQuery = Selection.all(Forest).branches.leaves.many();
if (leafQuery.build().root !== Tree)
  throw new Error('Packed contextual variant lost base identity.');
const treeReads = createGraphReadDispatcher({
  relationSelections: true,
  policies: [
    {
      entity: Forest,
      scope: 'all',
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 25,
      selectionRelations: ['nodes'],
      fields: { id: { select: true } },
    },
    {
      entity: Tree,
      variants: [Branch, Leaf],
      scope: 'all',
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 25,
      selectionRelations: ['children'],
      fields: {
        id: { select: true },
        parentId: { select: true },
        forestId: { select: true },
        type: { select: true },
      },
    },
  ],
  execute: query => Effect.runPromise(treeRuntime.run(query, undefined)),
});
const treeMetadata = await treeReads(
  { kind: 'graph-read-capabilities', version: 1, entityName: Tree.name },
  { authority: undefined },
);
const treeReflection = reflectConsoleApplicationVariants(
  [Forest, Tree].map(reflectSelectionLanguageEntity),
  treeMetadata.capabilities.variants,
);
for (const dialect of ['ts', 'declarative']) {
  const text =
    dialect === 'ts'
      ? 'Forest.branches.leaves.many()'
      : 'Forest through branches through leaves many';
  const read = analyzeConsoleDocument(text, treeReflection, { dialect }).request;
  const result = await treeReads(JSON.parse(JSON.stringify(read)), { authority: undefined });
  if (
    result.kind !== 'graph-read-result' ||
    result.value.length !== 1 ||
    result.value[0].id !== 'leaf'
  )
    throw new Error('Packed classified navigation lost source/target membership.');
}
