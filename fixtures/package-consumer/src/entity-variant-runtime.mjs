import {
  createEntityIdentityRef,
  createEntityRef,
  createInMemoryDataGraphRuntime,
  entity,
  field,
} from '@ontahi/core/data-graph';
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
