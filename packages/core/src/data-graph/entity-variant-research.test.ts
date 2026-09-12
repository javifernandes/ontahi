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
  normalizeEntityRef,
  safeParseGraphSchema,
  Selection,
  toGraphSchemaDescriptor,
} from './index.js';

const ContentNode = entity('VariantContentNode', {
  id: field.id(),
  bookId: field.string(),
  type: field.enum(['part', 'chapter']),
  title: field.nonEmptyString(),
  visible: field.boolean(),
});
const Book = entity('VariantBook', { id: field.id() }).hasMany('nodes', ContentNode, {
  via: 'bookId',
});

// Plan 152 contract experiment, deliberately NOT an Entity facade or a public schema node.
// Lower membership to the base Selection and validate values with existing schema primitives.
// A future implementation must carry this classification contract through receiver-owned schemas;
// merely returning this Selection to a caller does not enforce anything at a trust boundary.
const variant = <const TValue extends 'part' | 'chapter'>(
  name: string,
  options: { discriminator: { type: TValue } },
) => {
  const discriminator = options.discriminator.type;
  if (!ContentNode.fields.type.enumValues?.includes(discriminator)) {
    throw new Error('Variant discriminator must be a member of the base enum.');
  }
  const schema = graphSchema.object({
    ...ContentNode.fields,
    type: field.enum([discriminator]),
  });
  const membership = Selection.where(ContentNode, node => node.type.eq(discriminator));
  return {
    base: ContentNode,
    schema,
    get descriptor() {
      return {
        name,
        baseEntityName: ContentNode.name,
        discriminator: { fieldName: 'type', value: discriminator },
        lifecycle: 'fixed' as const,
        value: toGraphSchemaDescriptor(schema),
      };
    },
    select: (source: Selection<typeof ContentNode> = Selection.all(ContentNode)) =>
      source.and(membership),
  };
};

const Chapter = variant('Chapter', { discriminator: { type: 'chapter' } });
const Part = variant('Part', { discriminator: { type: 'part' } });
const makeRows = () => [
  { id: 'p1', bookId: 'b1', type: 'part', title: 'Part', visible: true },
  { id: 'c1', bookId: 'b1', type: 'chapter', title: 'Chapter', visible: true },
  { id: 'c2', bookId: 'b2', type: 'chapter', title: 'Other book', visible: true },
  { id: 'private', bookId: 'b1', type: 'chapter', title: 'Private', visible: false },
];
const runtimeFor = (rows = makeRows()) =>
  createInMemoryDataGraphRuntime({
    entities: [Book, ContentNode],
    dataset: { VariantBook: [{ id: 'b1' }, { id: 'b2' }], VariantContentNode: rows },
  });
const read = (selection: Selection<typeof ContentNode>, rows = makeRows()) =>
  Effect.runPromise(runtimeFor(rows).run(selection.toQuery().build(), undefined));

// Receiver experiment: parse untrusted base membership, then add mandatory classification and
// both scopes outside the caller expression. This is NOT existingRef/Operation integration.
const receiveChapterSelection = (input: unknown) => {
  const parsed = safeParseGraphSchema(
    graphSchema.selection(ContentNode, { entities: [Book, ContentNode] }),
    input,
  );
  if (!parsed.success) throw new Error('Invalid selection.');
  if (!(parsed.data instanceof Selection)) throw new Error('Expected hydrated Selection.');
  return Chapter.select(parsed.data)
    .and(node => node.bookId.eq('b1')) // base scope
    .and(node => node.visible.eq(true)); // additional variant scope
};
const receiveExistingChapter = async (input: unknown, rows = makeRows()) => {
  const parsed = safeParseGraphSchema(graphSchema.ref(ContentNode), input);
  if (!parsed.success) throw new Error('Invalid reference.');
  const members = await read(
    receiveChapterSelection(Selection.references(ContentNode, [parsed.data]).toAst()),
    rows,
  );
  // Do not distinguish missing, wrong kind and invisible rows at this boundary.
  if (members.length !== 1) throw new Error('Chapter unavailable.');
  const result = safeParseGraphSchema(Chapter.schema, members[0]);
  if (!result.success) throw new Error('Invalid Chapter value.');
  return result.data;
};

describe('Plan 152: discriminated Entity contract experiment', () => {
  it('narrows a value schema while retaining every base field constraint', () => {
    const result = safeParseGraphSchema(Chapter.schema, makeRows()[1]);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected Chapter.');
    expectTypeOf(result.data.type).toEqualTypeOf<'chapter'>();
    expectTypeOf(result.data).toExtend<{
      id: string;
      bookId: string;
      type: 'part' | 'chapter';
      title: string;
      visible: boolean;
    }>();
    expect(safeParseGraphSchema(Part.schema, result.data).success).toBe(false);
    expect(safeParseGraphSchema(Chapter.schema, { ...result.data, title: '' }).success).toBe(false);
    expect(safeParseGraphSchema(Chapter.schema, makeRows()[0]).success).toBe(false);
    expect(() =>
      // @ts-expect-error A fixed discriminator cannot introduce a new base enum member.
      variant('Article', { discriminator: { type: 'article' } }),
    ).toThrow('base enum');
  });

  it('captures a portable, immutable classification declaration separately from membership', () => {
    const declaration = { discriminator: { type: 'chapter' as const } };
    const classified = variant('Chapter', declaration);
    const descriptor = classified.descriptor;
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
    expect(descriptor).toMatchObject({
      name: 'Chapter',
      baseEntityName: ContentNode.name,
      lifecycle: 'fixed',
      discriminator: { fieldName: 'type', value: 'chapter' },
      value: { fields: { type: { enumValues: ['chapter'] } } },
    });
    descriptor.discriminator.fieldName = 'title';
    expect(classified.descriptor.discriminator.fieldName).toBe('type');
    expect(classified.select().root).toBe(ContentNode);
    expect(classified).not.toHaveProperty('update');
  });

  it('composes direct and contextual membership before a runtime or population exists', async () => {
    const direct = Chapter.select(Selection.where(ContentNode, node => node.bookId.eq('b1')));
    const contextual = Chapter.select(
      Selection.where(Book, book => book.id.eq('b1')).through('nodes'),
    );
    const ast = JSON.parse(JSON.stringify(contextual.toAst()));
    const parsed = safeParseGraphSchema(
      graphSchema.selection(ContentNode, { entities: [Book, ContentNode] }),
      ast,
    );
    if (!parsed.success) throw new Error('Expected portable contextual membership.');
    if (!(parsed.data instanceof Selection)) throw new Error('Expected hydrated Selection.');
    expect(await read(parsed.data)).toEqual(await read(direct));
    expect((await read(direct)).map(row => row.id)).toEqual(['c1', 'private']);
    expect(await read(Chapter.select(Selection.none(ContentNode)))).toEqual([]);
  });

  it('shares base identity and one existing cache entry for classified values', async () => {
    const row = await receiveExistingChapter(createEntityRef(ContentNode, { id: 'c1' }));
    const baseRef = createEntityIdentityRef(ContentNode, row)!;
    const classifiedRef = createEntityIdentityRef(Chapter.base, row)!;
    expect(classifiedRef).toEqual(baseRef);
    expect(normalizeEntityRef(classifiedRef)).toBe(normalizeEntityRef(baseRef));
    const cache = createGraphClientCache();
    expect(cache.writeEntity(ContentNode, row)?.ref).toEqual(baseRef);
    expect(cache.writeEntity(Chapter.base, { ...row, title: 'Updated' })?.ref).toEqual(baseRef);
    expect(cache.resolveEntityRef(classifiedRef)).toEqual(baseRef);
    expect(cache.readEntity(baseRef)).toEqual({ ...row, title: 'Updated' });
    cache.invalidateEntity(classifiedRef);
    expect(cache.readEntity(baseRef)).toBeUndefined();
  });

  it('accepts an unclassified canonical ref only after receiver-side membership validation', async () => {
    const ref = createEntityRef(ContentNode, { id: 'c1' });
    const row = await receiveExistingChapter(JSON.parse(JSON.stringify(ref)));
    expect(row.id).toBe('c1');
    expectTypeOf(row.type).toEqualTypeOf<'chapter'>();
  });

  it.each(['missing', 'p1', 'private', 'c2'])(
    'does not disclose missing, wrong-kind or denied membership for %s',
    async id => {
      await expect(receiveExistingChapter(createEntityRef(ContentNode, { id }))).rejects.toThrow(
        'Chapter unavailable.',
      );
    },
  );

  it('keeps classification and both scopes outside caller union/complement expressions', async () => {
    const caller = Selection.where(ContentNode, node => node.visible.eq(true))
      .not()
      .or(Selection.all(ContentNode));
    expect((await read(receiveChapterSelection(caller.toAst()))).map(row => row.id)).toEqual([
      'c1',
    ]);
    await expect(receiveExistingChapter(createEntityRef('Chapter', { id: 'p1' }))).rejects.toThrow(
      'Invalid reference.',
    );
  });

  it('rechecks stale classification without changing identity after an external transition', async () => {
    const ref = createEntityRef(ContentNode, { id: 'c1' });
    const rows = makeRows();
    await expect(receiveExistingChapter(ref, rows)).resolves.toMatchObject({ type: 'chapter' });
    rows[1] = { ...rows[1]!, type: 'part' };
    expect(createEntityIdentityRef(ContentNode, rows[1])).toEqual(ref);
    await expect(receiveExistingChapter(ref, rows)).rejects.toThrow('Chapter unavailable.');
    // This simulates an external change, not permission for generic discriminator writes.
  });

  it('records why a renamed Entity or a bare base ref schema cannot implement variants', async () => {
    const RenamedChapter = entity('Chapter', ContentNode.fields);
    const row = makeRows()[1]!;
    expect(normalizeEntityRef(createEntityIdentityRef(RenamedChapter, row)!)).not.toBe(
      normalizeEntityRef(createEntityIdentityRef(ContentNode, row)!),
    );
    expect(
      await Effect.runPromise(
        runtimeFor().run(Selection.all(RenamedChapter).toQuery().build(), undefined),
      ),
    ).toEqual([]); // It looks for a separate population instead of ContentNode's storage.
    const baseInput = graphSchema.existingRef(ContentNode);
    expect(
      safeParseGraphSchema(baseInput, createEntityRef(ContentNode, { id: 'p1' })).success,
    ).toBe(true); // Parsing a Ref proves neither existence nor classification.
    expect(toGraphSchemaDescriptor(baseInput)).not.toHaveProperty('discriminator');
    expect(Chapter.select().toAst().entityName).toBe(ContentNode.name);
    // Lowered membership also loses the named schema target: public schema/protocol work remains.
  });
});
