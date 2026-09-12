import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createEntityIdentityRef,
  createEntityRef,
  createGraphClientCache,
  createInMemoryDataGraphRuntime,
  entity,
  field,
  graphSchema,
  Selection,
  withSelectionFactories,
  type AnyEntityDefinition,
} from './index.js';

const ContentNode = withSelectionFactories(
  entity('ClassifiedNode', {
    id: field.id(),
    bookId: field.string(),
    type: field.enum(['part', 'chapter']),
    title: field.string(),
  }),
  {
    id: {
      version: 1,
      input: graphSchema.object({ id: field.id() }),
      scalarInput: 'id',
      template: { kind: 'identity', bindings: { id: 'id' } },
    },
    named: {
      version: 1,
      input: graphSchema.object({ title: field.string() }),
      scalarInput: 'title',
      template: { kind: 'predicate', fieldName: 'title', operator: 'eq', input: 'title' },
    },
  },
);
const Chapter = ContentNode.variant('Chapter', { discriminator: { type: 'chapter' } });
const Part = ContentNode.variant('Part', { discriminator: { type: 'part' } });
const Book = entity('VariantBook', { id: field.id() }).hasMany('nodes', ContentNode, {
  via: 'bookId',
});
const rows = [
  { id: 'p1', bookId: 'b1', type: 'part', title: 'Intro' },
  { id: 'c1', bookId: 'b1', type: 'chapter', title: 'Intro' },
  { id: 'c2', bookId: 'b1', type: 'chapter', title: 'Middle' },
  { id: 'c3', bookId: 'b2', type: 'chapter', title: 'End' },
];
const runtime = createInMemoryDataGraphRuntime({
  entities: [ContentNode, Book],
  dataset: { ClassifiedNode: rows, VariantBook: [{ id: 'b1' }, { id: 'b2' }] },
});
const read = (selected: ReturnType<typeof Chapter.all>) =>
  Effect.runPromise(runtime.run(selected.many(), undefined));

describe('discriminated Entity read universes', () => {
  it('reads the base population with narrowed row and predicate types', async () => {
    const selected = Chapter.where(node => {
      expectTypeOf(node.type.eq).parameter(0).toEqualTypeOf<'chapter'>();
      return node.title.eq('Intro');
    });
    const result = await read(selected);
    expectTypeOf<(typeof result)[number]['type']>().toEqualTypeOf<'chapter'>();
    expect(result).toEqual([rows[1]]);
    expect((await read(Chapter.all())).map(row => row.id)).toEqual(['c1', 'c2', 'c3']);
    expect(selected.toQuery().build().root).toBe(ContentNode);
    expect(Chapter.name).toBe('Chapter');
    expect(Chapter.base).toBe(ContentNode);
  });

  it('interprets complement relative to Chapter, including all and double complement', async () => {
    const intro = Chapter.where(node => node.title.eq('Intro'));
    expect((await read(intro.not())).map(row => row.id)).toEqual(['c2', 'c3']);
    expect(await read(intro.not().not())).toEqual(await read(intro));
    expect(await read(Chapter.all().not())).toEqual([]);
    expect(await read(Chapter.all().not().not())).toEqual(await read(Chapter.all()));
    expect(await read(intro)).toEqual([rows[1]]); // composing never mutates the source
  });

  it('preserves the universe through chained where, and, or and De Morgan composition', async () => {
    const intro = Chapter.where(node => node.title.eq('Intro'));
    const end = Chapter.where(node => node.title.eq('End'));
    expect((await read(intro.or(end))).map(row => row.id)).toEqual(['c1', 'c3']);
    expect((await read(intro.or(end).not())).map(row => row.id)).toEqual(['c2']);
    expect(await read(intro.or(end).not())).toEqual(await read(intro.not().and(end.not())));
    expect(await read(intro.or(Chapter.all()))).toEqual(await read(Chapter.all()));
    expect(
      await read(
        Chapter.all()
          .where(n => n.bookId.eq('b1'))
          .and(intro),
      ),
    ).toEqual([rows[1]]);
    // JS/untrusted callbacks cannot select another classification, even if TypeScript is bypassed.
    expect(await read(Chapter.all().or(() => ({ kind: 'all' })))).toEqual(
      await read(Chapter.all()),
    );
    expect(
      await read(
        Chapter.where(() => ({
          kind: 'predicate',
          fieldName: 'type',
          operator: 'eq',
          value: 'part',
        })),
      ),
    ).toEqual([]);
  });

  it('reuses base factory input contracts and intersects their output with classification', async () => {
    expect(await read(Chapter.by({ id: 'c1' }))).toEqual([rows[1]]);
    expect(await read(Chapter.by({ id: 'p1' }))).toEqual([]);
    expect(await read(Chapter.by({ named: 'Intro' }))).toEqual([rows[1]]);
    expect((await read(Chapter.by({ named: 'Intro' }).not())).map(row => row.id)).toEqual([
      'c2',
      'c3',
    ]);
    // @ts-expect-error Factory input is inherited from the base declaration.
    expect(() => Chapter.by({ missing: 'x' })).toThrow('Unknown Selection factory');
    // @ts-expect-error Identity input remains a string, not a number.
    expect(() => Chapter.by({ id: 123 })).toThrow();
  });

  it('accepts base references without treating identity as proof of classification', async () => {
    const selected = Chapter.references(
      ['p1', 'c1', 'missing'].map(id => createEntityRef(ContentNode, { id })),
    );
    expect(await read(selected)).toEqual([rows[1]]);
    expect(await read(Chapter.references([]))).toEqual([]);
    // @ts-expect-error A variant name is not a new Ref namespace.
    expect(() => Chapter.references([createEntityRef('Chapter', { id: 'c1' })])).toThrow(
      'reference',
    );
  });

  it('narrows contextual membership without loading intermediate rows', async () => {
    const selected = Chapter.from(Selection.where(Book, b => b.id.eq('b1')).through('nodes'));
    expect((await read(selected)).map(row => row.id)).toEqual(['c1', 'c2']);
    expect((await read(selected.not())).map(row => row.id)).toEqual(['c3']);
    // @ts-expect-error The source must select base ContentNodes, not Books.
    expect(() => Chapter.from(Selection.all(Book))).toThrow('Expected a ClassifiedNode Selection');
  });

  it('does not implicitly mix different classification universes', () => {
    // @ts-expect-error Part and Chapter have different classification contracts.
    expect(() => Chapter.all().or(Part.all())).toThrow('same classification');
    // @ts-expect-error Base selection requires explicit narrowing with from().
    expect(() => Chapter.all().or(Selection.all(ContentNode))).toThrow('same classification');
    const foreign = ContentNode.variant('Chapter', { discriminator: { type: 'chapter' } });
    expect(() => Chapter.all().or(foreign.all())).toThrow('same classification');
  });

  it('applies ordering/limit after membership and retains narrowed result types', async () => {
    const ordered = Chapter.all()
      .orderBy(n => n.title.asc())
      .limit(2);
    const result = await Effect.runPromise(runtime.run(ordered, undefined));
    expect(result.map(row => row.id)).toEqual(['c3', 'c1']);
    expectTypeOf<(typeof result)[number]['type']>().toEqualTypeOf<'chapter'>();
    expect(await Effect.runPromise(runtime.run(Chapter.all().limit(0), undefined))).toEqual([]);
    expect(await Effect.runPromise(runtime.count(Chapter.all().count().read, undefined))).toBe(3);
    expect(
      await Effect.runPromise(runtime.get(Chapter.references([]).exists().read, undefined)),
    ).toBeNull();
  });

  it('enforces exact-one after classification, independently of read limits', async () => {
    expect(
      await Effect.runPromise(runtime.get(Chapter.by({ id: 'c1' }).one().read, undefined)),
    ).toEqual(rows[1]);
    await expect(
      Effect.runPromise(runtime.get(Chapter.by({ id: 'p1' }).one().read, undefined)),
    ).rejects.toThrow('exactly one');
    await expect(
      Effect.runPromise(runtime.get(Chapter.all().limit(1).one().read, undefined)),
    ).rejects.toThrow('exactly one');
    await expect(
      Effect.runPromise(runtime.get(Chapter.by({ id: 'c1' }).limit(0).one().read, undefined)),
    ).rejects.toThrow('limit(0)');
    expect(() => Chapter.from(Selection.references(ContentNode, [], 'one'))).toThrow(
      'after narrowing',
    );
  });

  it('keeps base canonical identity and cache invalidation for the narrowed result', async () => {
    const [chapter] = await read(Chapter.by({ id: 'c1' }));
    const identity = createEntityIdentityRef(ContentNode, chapter!)!;
    expect(identity).toEqual(createEntityRef(ContentNode, { id: 'c1' }));
    const cache = createGraphClientCache();
    cache.writeEntity(ContentNode, rows[1]!);
    cache.writeEntity(Chapter.base, chapter!);
    expect(cache.readEntity(identity)).toEqual(chapter);
    cache.invalidateEntity(identity);
    expect(cache.readEntity(identity)).toBeUndefined();
  });

  it('captures discriminator data and copies caller expressions before composition', async () => {
    const options = { discriminator: { type: 'chapter' as const } };
    const classified = ContentNode.variant('Captured', options);
    Object.assign(options.discriminator, { type: 'part' });
    const predicate = {
      kind: 'predicate' as const,
      fieldName: 'title',
      operator: 'eq' as const,
      value: 'Intro',
    };
    const selected = classified.where(() => predicate);
    predicate.value = 'End';
    const result = await Effect.runPromise(runtime.run(selected.many(), undefined));
    expect(result).toEqual([rows[1]]);
  });

  it('evaluates current membership on each execution without changing canonical identity', async () => {
    const selected = Chapter.by({ id: 'c1' });
    const dataset = { ClassifiedNode: rows.map(row => ({ ...row })) };
    const local = createInMemoryDataGraphRuntime({ entities: [ContentNode], dataset });
    const before = await Effect.runPromise(local.run(selected.many(), undefined));
    expect(before).toEqual([rows[1]]);
    const identity = createEntityIdentityRef(ContentNode, before[0]!)!;
    dataset.ClassifiedNode[1]!.type = 'part';
    expect(await Effect.runPromise(local.run(selected.many(), undefined))).toEqual([]);
    expect(createEntityIdentityRef(ContentNode, dataset.ClassifiedNode[1]!)).toEqual(identity);
  });

  it('rejects invalid names, unknown values and unsupported classifier fields', () => {
    expect(() => ContentNode.variant('', { discriminator: { type: 'chapter' } })).toThrow('name');
    expect(() =>
      ContentNode.variant(ContentNode.name, { discriminator: { type: 'chapter' } }),
    ).toThrow('name');
    // @ts-expect-error Only declared enum values are valid.
    expect(() => ContentNode.variant('Other', { discriminator: { type: 'other' } })).toThrow(
      'enum',
    );
    // @ts-expect-error Free-form strings are not classifiers.
    expect(() => ContentNode.variant('Intro', { discriminator: { title: 'Intro' } })).toThrow(
      'enum',
    );
    // @ts-expect-error Exactly one classifier is required.
    expect(() => ContentNode.variant('Empty', { discriminator: {} })).toThrow('exactly one');
    const Invalid = entity('InvalidClassifier', {
      id: field.id(),
      type: field.nullable(field.enum(['a', 'b'])),
    });
    // @ts-expect-error Nullable enum classification is not supported.
    expect(() => Invalid.variant('A', { discriminator: { type: 'a' } })).toThrow('enum');
  });

  it('does not advertise schema input, write or portable variant support prematurely', () => {
    expectTypeOf<typeof Chapter>().not.toExtend<AnyEntityDefinition>();
    expectTypeOf(Chapter.all()).not.toHaveProperty('update');
    expectTypeOf(Chapter.all()).not.toHaveProperty('delete');
    expect(Chapter).not.toHaveProperty('insert');
    expect(Chapter.all()).not.toHaveProperty('update');
    expect(() => JSON.stringify(Chapter)).toThrow('not supported yet');
    expect(() => JSON.stringify(Chapter.all())).toThrow('not supported yet');
    expect(() => createEntityRef(Chapter, { id: 'c1' })).toThrow('canonical base Entity');
    expect(Chapter.all().many().build().root).toBe(ContentNode);
  });

  it('rejects unsupported declarations and validates callback expressions', () => {
    const Plain = entity('Plain', { id: field.id(), type: field.enum(['a', 'b']) });
    const A = Plain.variant('A', { discriminator: { type: 'a' } });
    // @ts-expect-error No by inputs exist without a declared base factory.
    expect(() => A.by({ id: 'x' })).toThrow('No named Selection factories');
    const withUnrelatedMethod = Object.assign(Plain, {
      by: () => {
        throw new Error('Unrelated method must not run.');
      },
    });
    const unrelated = withUnrelatedMethod.variant('Unrelated', { discriminator: { type: 'a' } });
    // @ts-expect-error A method called by is not a declared pure Selection factory.
    expect(() => unrelated.by({ id: 'x' })).toThrow('No named Selection factories');
    const Two = entity('Two', { left: field.enum(['a', 'b']), right: field.enum(['a', 'b']) });
    // @ts-expect-error Exactly one classifier is supported.
    expect(() => Two.variant('A', { discriminator: { left: 'a', right: 'a' } })).toThrow(
      'exactly one',
    );
    expect(() =>
      Chapter.where(() => ({
        kind: 'predicate',
        fieldName: 'missing',
        operator: 'eq',
        value: 'x',
      })),
    ).toThrow();
    expect(Chapter.all().first().intent).toBe('first');
    expect(Chapter.all().exists().intent).toBe('exists');
    const callback = Chapter.where(n => n.title.eq('Intro')).or(n => n.title.eq('End'));
    expect(callback.toQuery().build().root).toBe(ContentNode);
  });
});
