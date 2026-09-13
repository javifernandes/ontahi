import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphRuntime,
  defineGraphApi,
  entity,
  field,
  graphSchema,
  safeParseGraphSchema,
  Selection,
  toGraphSchemaDescriptor,
  toGraphJsonSchema,
  type EntityRef,
  type EntityRefLocator,
  type InferGraphSchemaClientInput,
} from '../../data-graph/index.js';

import {
  createDataGraphArchitectureAdapter,
  defineDomainOperation,
  defineDomainOperationsForEntity,
  runServerDomainOperationRaw,
} from './index.js';

const Node = entity('ParticipantNode', {
  id: field.id(),
  type: field.enum(['part', 'chapter']),
  title: field.nonEmptyString(),
  visible: field.boolean(),
});
const Chapter = Node.variant('Chapter', { discriminator: { type: 'chapter' } });
const makeRuntime = () =>
  createInMemoryDataGraphRuntime({
    entities: [Node],
    dataset: {
      ParticipantNode: [
        { id: 'part', type: 'part', title: 'Part', visible: true },
        { id: 'chapter', type: 'chapter', title: 'Chapter', visible: true },
        { id: 'private', type: 'chapter', title: 'Private', visible: false },
      ],
    },
  });
const operation = (input: ReturnType<typeof graphSchema.object>, run: (...args: any[]) => any) =>
  defineDomainOperationsForEntity(
    Node,
    { inspect: defineDomainOperation({ input, run }) },
    {
      exposure: 'server-only',
      layer: 'tests.variant-ref',
    },
  ).inspect;

describe('schema-native variant participants', () => {
  it('rejects classified participant targets without a canonical identity at declaration', () => {
    const Unidentified = entity('Unidentified', { type: field.enum(['chapter', 'part']) });
    const Classification = Unidentified.variant('Classification', {
      discriminator: { type: 'chapter' },
    });
    expect(() => graphSchema.existingRef(Classification)).toThrow('canonical identity');
  });

  it.each<EntityRefLocator>([{ title: 'Chapter' }, { id: 'chapter', title: 'Chapter' }, {}])(
    'rejects noncanonical variant locators before resolving: %j',
    async locator => {
      const load = vi.fn(() =>
        Effect.succeed({ id: 'chapter', type: 'chapter', title: 'Chapter', visible: true }),
      );
      const body = vi.fn(() => Effect.succeed('reached'));
      const input = graphSchema.object({
        chapter: graphSchema.existingRef(Chapter).resolveWith(load),
      });
      const value = { chapter: createEntityRef(Node, locator) };
      expect(safeParseGraphSchema(input, value).success).toBe(false);
      expect(await runServerDomainOperationRaw(operation(input, body), value)).toMatchObject({
        success: false,
        reason: 'invalid_input',
        message: expect.stringContaining('canonical identity'),
        inputPath: 'chapter',
      });
      expect(load).not.toHaveBeenCalled();
      expect(body).not.toHaveBeenCalled();
    },
  );

  it('reflects canonical identity and the classification requirement as separate data', () => {
    const reference = graphSchema.existingRef(Chapter);
    const input = graphSchema.object({ chapter: reference });
    expectTypeOf<InferGraphSchemaClientInput<typeof input>>().toEqualTypeOf<{
      chapter: EntityRef<'ParticipantNode'>;
    }>();
    expect(reference.target).toBe(Node);
    const descriptor = toGraphSchemaDescriptor(reference);
    expect(descriptor).toEqual({
      kind: 'entity-ref',
      entityName: 'ParticipantNode',
      identity: { name: 'refById', fields: ['id'] },
      resolution: 'existing',
      variant: {
        kind: 'entity-variant',
        name: 'Chapter',
        baseEntityName: 'ParticipantNode',
        discriminator: { fieldName: 'type', value: 'chapter' },
      },
    });
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
    expect(toGraphJsonSchema(reference)['x-ontahi-entity-ref']?.variant).toEqual(
      Chapter.descriptor,
    );
    expect(
      safeParseGraphSchema(input, { chapter: createEntityRef(Node, { id: 'part' }) }).success,
    ).toBe(true);
    expect(
      safeParseGraphSchema(input, { chapter: createEntityRef('Chapter', { id: 'chapter' }) })
        .success,
    ).toBe(false);
  });

  it('validates complete composite identities without confusing them with alternate locators', async () => {
    const ScopedNode = entity('ScopedNode', {
      tenant: field.string(),
      key: field.string(),
      slug: field.string(),
      type: field.enum(['chapter', 'part']),
    })
      .locators({ canonical: ['tenant', 'key'], bySlug: 'slug' })
      .identity('canonical');
    const ScopedChapter = ScopedNode.variant('ScopedChapter', {
      discriminator: { type: 'chapter' },
    });
    const load = vi.fn(() =>
      Effect.succeed({
        tenant: 'acme',
        key: 'chapter',
        slug: 'intro',
        type: 'chapter',
      }),
    );
    const body = vi.fn(input => Effect.succeed(input.chapter.ref));
    const input = graphSchema.object({
      chapter: graphSchema.existingRef(ScopedChapter).resolveWith(load),
    });
    const inspect = operation(input, body);
    const alternateLocators: EntityRefLocator[] = [{ tenant: 'acme' }, { slug: 'intro' }];
    for (const locator of alternateLocators) {
      const value = { chapter: createEntityRef(ScopedNode, locator) };
      expect(safeParseGraphSchema(input, value).success).toBe(false);
      expect(await runServerDomainOperationRaw(inspect, value)).toMatchObject({
        success: false,
        reason: 'invalid_input',
      });
    }
    expect(load).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    const ref = createEntityRef(ScopedNode, { tenant: 'acme', key: 'chapter' });
    expect(safeParseGraphSchema(input, { chapter: ref }).success).toBe(true);
    expect(await runServerDomainOperationRaw(inspect, { chapter: ref })).toEqual({
      success: true,
      data: ref,
    });
    expect(load).toHaveBeenCalledOnce();
  });

  it('materializes with the normal base runtime and narrows the Operation input type', async () => {
    const runtime = makeRuntime();
    const reads = vi.spyOn(runtime, 'get');
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      unknown,
      undefined,
      undefined,
      typeof runtime
    >({ createRuntime: () => runtime });
    const inspect = defineDomainOperationsForEntity(
      Node,
      {
        inspect: defineDomainOperation({
          input: graphSchema.object({ chapter: graphSchema.existingRef(Chapter) }),
          concerns: [graph.withRuntime()],
          run: ({ chapter }) => {
            expectTypeOf(chapter.type).toEqualTypeOf<'chapter'>();
            expectTypeOf(chapter.ref).toEqualTypeOf<EntityRef<'ParticipantNode'>>();
            return Effect.succeed({ title: chapter.title, ref: chapter.ref, type: chapter.type });
          },
        }),
      },
      { exposure: 'server-only', layer: 'tests.variant-default-ref' },
    ).inspect;
    const ref = createEntityRef(Node, { id: 'chapter' });
    const discovery = defineGraphApi({
      entities: { Node: { ...Node, domain: { inspect } } },
    }).describe();
    expect(discovery.domainOperations[0]?.input).toEqual(
      toGraphSchemaDescriptor(graphSchema.object({ chapter: graphSchema.existingRef(Chapter) })),
    );
    expect(
      JSON.parse(JSON.stringify(discovery)).domainOperations[0].input.fields.chapter.variant,
    ).toEqual(Chapter.descriptor);
    expect(
      await runServerDomainOperationRaw(inspect, JSON.parse(JSON.stringify({ chapter: ref }))),
    ).toEqual({
      success: true,
      data: { title: 'Chapter', ref, type: 'chapter' },
    });
    expect(reads).toHaveBeenCalledOnce();
    const spec = reads.mock.calls[0]![0];
    expect('root' in spec ? spec.root : undefined).toBe(Node);
  });

  it.each(['part', 'missing', 'private'])(
    'rejects %s without entering the body or leaking membership',
    async id => {
      const runtime = makeRuntime();
      // Host-owned visibility filtering uses the real base runtime, not caller-provided metadata.
      const ref = graphSchema.existingRef(Chapter).resolveWith(reference =>
        runtime.get(
          Selection.references(Node, [reference])
            .and(n => n.visible.eq(true))
            .toQuery(),
          undefined,
        ),
      );
      const body = vi.fn(() => Effect.succeed('reached'));
      const inspect = operation(graphSchema.object({ chapter: ref }), body);
      const result = await runServerDomainOperationRaw(inspect, {
        chapter: { ...createEntityRef(Node, { id }), type: 'chapter', variant: Chapter.descriptor },
      });
      expect(result).toMatchObject({
        success: false,
        reason: 'entity_not_found',
        message: 'Referenced Chapter was not found.',
        entityName: 'ParticipantNode',
        inputPath: 'chapter',
      });
      expect(body).not.toHaveBeenCalled();
    },
  );

  it('retains validation after resolveWith and does not let reflected copies change the contract', async () => {
    const schema = graphSchema.existingRef(Chapter);
    const load = vi.fn(() =>
      Effect.succeed({ id: 'chapter', type: 'chapter', title: 'Chapter', visible: true }),
    );
    const resolved = schema.resolveWith(load);
    const descriptor = Chapter.descriptor;
    descriptor.discriminator.value = 'part';
    resolved.variant!.discriminator.value = 'part';
    expect(schema.variant?.discriminator.value).toBe('chapter');
    expect(resolved.variant?.discriminator.value).toBe('chapter');
    const input = graphSchema.object({ chapter: resolved });
    const inspect = defineDomainOperationsForEntity(
      Node,
      {
        inspect: defineDomainOperation({
          input,
          run: ({ chapter }) => {
            expectTypeOf(chapter.type).toEqualTypeOf<'chapter'>();
            return Effect.succeed(chapter.type);
          },
        }),
      },
      { exposure: 'server-only', layer: 'tests.variant-custom-ref' },
    ).inspect;
    expect(
      await runServerDomainOperationRaw(inspect, {
        chapter: createEntityRef(Node, { id: 'chapter' }),
      }),
    ).toEqual({ success: true, data: 'chapter' });
    expect(load).toHaveBeenCalledOnce();
  });

  it.each([
    { id: 'chapter', type: 'part', title: 'Part', visible: true },
    { id: 'different', type: 'chapter', title: 'Other Chapter', visible: true },
  ])(
    'checks membership and canonical identity even for custom resolver output',
    async participant => {
      const body = vi.fn(() => Effect.succeed('reached'));
      const reference = graphSchema
        .existingRef(Chapter)
        .resolveWith(() => Effect.succeed(participant));
      expect(
        await runServerDomainOperationRaw(
          operation(graphSchema.object({ chapter: reference }), body),
          {
            chapter: createEntityRef(Node, { id: 'chapter' }),
          },
        ),
      ).toMatchObject({ success: false, reason: 'entity_not_found' });
      expect(body).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed matching records and leaves resolver data untouched', async () => {
    const body = vi.fn(() => Effect.succeed('reached'));
    const participant = { id: 'chapter', type: 'chapter', title: '', visible: true };
    const reference = graphSchema
      .existingRef(Chapter)
      .resolveWith(() => Effect.succeed(participant));
    expect(
      await runServerDomainOperationRaw(
        operation(graphSchema.object({ chapter: reference }), body),
        {
          chapter: createEntityRef(Node, { id: 'chapter' }),
        },
      ),
    ).toMatchObject({ success: false });
    expect(body).not.toHaveBeenCalled();
    expect(participant).not.toHaveProperty('ref');
  });

  it('does not treat a previously resolved base participant as classification proof', async () => {
    const load = vi.fn(() =>
      Effect.succeed({ id: 'part', type: 'part', title: 'Part', visible: true }),
    );
    const body = vi.fn(() => Effect.succeed('reached'));
    const inspect = operation(
      graphSchema.object({
        node: graphSchema.existingRef(Node).resolveWith(load),
        chapter: graphSchema.existingRef(Chapter).resolveWith(load),
      }),
      body,
    );
    const ref = createEntityRef(Node, { id: 'part' });
    expect(await runServerDomainOperationRaw(inspect, { node: ref, chapter: ref })).toMatchObject({
      success: false,
      reason: 'entity_not_found',
      inputPath: 'chapter',
    });
    expect(body).not.toHaveBeenCalled();
  });

  it('skips absent optional/nullable references without resolving', async () => {
    const load = vi.fn();
    const reference = graphSchema.existingRef(Chapter).resolveWith(load);
    const inspect = operation(
      graphSchema.object({
        chapter: graphSchema.optional(reference),
        other: graphSchema.nullable(reference),
      }),
      input => Effect.succeed(input),
    );
    expect(await runServerDomainOperationRaw(inspect, { other: null })).toEqual({
      success: true,
      data: { other: null },
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps unsupported stored references and nested Operation inputs explicit', () => {
    const reference = graphSchema.existingRef(Chapter);
    expect(() => entity('StoredVariantRef', { id: field.id(), chapter: reference })).toThrow(
      'not stored Reference Fields',
    );
    expect(() =>
      operation(graphSchema.object({ nested: graphSchema.object({ chapter: reference }) }), () =>
        Effect.succeed('x'),
      ),
    ).toThrow('only direct top-level fields');
  });
});
