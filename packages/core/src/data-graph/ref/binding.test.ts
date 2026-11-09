import { describe, expect, it } from 'vitest';

import { defineClientEntity, entity, field, graphSchema, value } from '../index.js';

import {
  bindEntityRefMethods,
  bindEntityRefOperationProxy,
  bindEntityRefRelationOperations,
} from './binding.js';
import { createEntityRef } from './model.js';

describe('bound Entity Ref affordances', () => {
  const Invite = entity('Invite', { id: field.id(), token: field.string() });

  it('preserves native participants through callable client operations', () => {
    const ClientInvite = defineClientEntity(Invite, {
      domainOperations: {
        accept: {
          kind: 'domain-operation',
          authority: 'server',
          exposure: 'bridge',
          bridge: {},
          input: value('ClientInviteInput', { invite: graphSchema.ref(Invite) }),
          output: graphSchema.void(),
        },
      },
    });
    const ref = ClientInvite.ref({ token: 'token' });
    expect(ref.accept().input).toEqual({ invite: ref });
  });

  it.each([
    graphSchema.object({
      invite: graphSchema.ref(Invite),
      note: graphSchema.optional(field.string()),
    }),
    value('InviteInput', {
      invite: graphSchema.ref(Invite),
      note: graphSchema.optional(field.string()),
    }),
    graphSchema.object({ invite: graphSchema.optional(graphSchema.ref(Invite)) }),
    graphSchema.object({ invite: graphSchema.nullable(graphSchema.existingRef(Invite)) }),
  ])(
    'binds the receiver into a native participant instead of flattening its locator (%#)',
    input => {
      const ref = createEntityRef(Invite, { token: 'secret-token' });
      const proxy = bindEntityRefOperationProxy(
        ref,
        { accept: { input } },
        {
          run: ({ input }) => input,
        },
      );
      expect(proxy.accept()).toEqual({ invite: ref });
      expect(proxy.accept({ note: 'hello' })).toEqual({ invite: ref, note: 'hello' });
    },
  );

  it('does not guess between two participants of the same entity', () => {
    const proxy = bindEntityRefOperationProxy(
      createEntityRef(Invite, { id: 'one' }),
      {
        merge: {
          input: graphSchema.object({
            source: graphSchema.ref(Invite),
            target: graphSchema.ref(Invite),
          }),
        },
      },
      { run: ({ input }) => input },
    );
    expect(() => proxy.merge()).toThrow('Ambiguous Invite receiver');
  });

  it('binds the declared receiver path and rejects explicit or wrong-Entity receivers', () => {
    const ref = createEntityRef(Invite, { id: 'one' });
    const operation = {
      receiver: {
        kind: 'input',
        path: 'target',
        entityName: 'Invite',
        source: 'declaration',
      },
      input: graphSchema.object({
        source: graphSchema.ref(Invite),
        target: graphSchema.ref(Invite),
      }),
    } as const;
    const proxy = bindEntityRefOperationProxy(
      ref,
      { merge: operation },
      { run: ({ input }) => input },
    );

    expect(proxy.merge({ source: createEntityRef(Invite, { id: 'source' }) })).toEqual({
      source: createEntityRef(Invite, { id: 'source' }),
      target: ref,
    });
    expect(() => proxy.merge({ target: ref })).toThrow('must not supply receiver "target"');
    expect(() => proxy.merge('invalid')).toThrow('arguments must be an object');

    const wrongEntity = bindEntityRefOperationProxy(
      createEntityRef('Actor', { id: 'actor' }),
      { merge: operation },
      { run: ({ input }) => input },
    );
    expect(() => wrongEntity.merge()).toThrow('Cannot bind Actor Ref to Invite receiver "target"');

    const typeReceiver = bindEntityRefOperationProxy(
      ref,
      {
        create: {
          receiver: {
            kind: 'entity-type',
            entityName: 'Invite',
            source: 'declaration',
          },
        },
      },
      { run: ({ input }) => input },
    );
    expect(() => typeReceiver.create()).toThrow(
      'Entity-type Operations cannot be bound to an Entity Ref',
    );
  });

  it('preserves legacy same-Ref and cross-participant binding without allowing redirects', () => {
    const Actor = entity('LegacyActor', { id: field.id() });
    const invite = createEntityRef(Invite, { id: 'invite' });
    const actor = createEntityRef(Actor, { id: 'actor' });
    const otherActor = createEntityRef(Actor, { id: 'other' });
    const operation = {
      receiver: {
        kind: 'input',
        path: 'actor',
        entityName: 'LegacyActor',
        source: 'legacy-graph-ops',
      },
      input: graphSchema.object({
        invite: graphSchema.ref(Invite),
        actor: graphSchema.ref(Actor),
      }),
    } as const;

    const actorProxy = bindEntityRefOperationProxy(
      actor,
      { accept: operation },
      { run: ({ input }) => input },
    );
    expect(actorProxy.accept({ actor, invite })).toEqual({ actor, invite });
    expect(() => actorProxy.accept({ actor: otherActor, invite })).toThrow(
      'cannot redirect to another Entity Ref',
    );

    const inviteProxy = bindEntityRefOperationProxy(
      invite,
      { accept: operation },
      { run: ({ input }) => input },
    );
    expect(inviteProxy.accept({ actor })).toEqual({ invite, actor });
  });

  it('matches by target entity and preserves an explicit participant override', () => {
    const Actor = entity('Actor', { id: field.id() });
    const ref = createEntityRef(Invite, { token: 'one' });
    const other = createEntityRef(Invite, { token: 'two' });
    const actor = createEntityRef(Actor, { id: 'actor' });
    const proxy = bindEntityRefOperationProxy(
      ref,
      {
        accept: {
          input: graphSchema.object({
            actor: graphSchema.ref(Actor),
            invite: graphSchema.ref(Invite),
          }),
        },
      },
      { run: ({ input }) => input },
    );
    expect(proxy.accept({ actor })).toEqual({ invite: ref, actor });
    expect(proxy.accept({ actor, invite: other })).toEqual({ invite: other, actor });
  });

  it('preserves explicit adapters even when the native receiver would be ambiguous', () => {
    const ref = createEntityRef(Invite, { id: 'one' });
    const proxy = bindEntityRefOperationProxy(
      ref,
      {
        merge: {
          input: value('MergeInvites', {
            source: graphSchema.ref(Invite),
            target: graphSchema.ref(Invite),
          }),
        },
      },
      { input: ({ ref }) => ({ target: ref }), run: ({ input }) => input },
    );
    expect(proxy.merge()).toEqual({ target: ref });
  });

  it('enforces declared receivers after an explicit adapter maps the input', () => {
    const ref = createEntityRef(Invite, { id: 'one' });
    const other = createEntityRef(Invite, { id: 'two' });
    const operation = {
      receiver: {
        kind: 'input',
        path: 'invite',
        entityName: Invite.name,
        participant: 'ref',
        requirement: 'portable',
        source: 'declaration',
      },
      input: graphSchema.object({ invite: graphSchema.ref(Invite) }),
    } as const;
    const proxy = bindEntityRefOperationProxy(
      ref,
      { inspect: operation },
      {
        input: () => ({ invite: other }),
        run: ({ input }) => input,
      },
    );

    expect(() => proxy.inspect()).toThrow('must not supply receiver "invite"');
  });

  it('keeps Selection participants while binding a declared receiver', () => {
    const Book = entity('SelectionBook', { id: field.id() });
    const ref = createEntityRef(Invite, { id: 'one' });
    const books = defineClientEntity(Book).selection(book => book.id.eq('one'));
    const operation = {
      receiver: {
        kind: 'input',
        path: 'invite',
        entityName: Invite.name,
        participant: 'ref',
        requirement: 'portable',
        source: 'declaration',
      },
      input: graphSchema.object({
        invite: graphSchema.ref(Invite),
        books: graphSchema.selection(Book),
      }),
    } as const;
    const proxy = bindEntityRefOperationProxy(
      ref,
      { inspect: operation },
      {
        run: ({ input }) => input,
      },
    );

    expect(proxy.inspect({ books })).toEqual({ invite: ref, books });
  });

  it('does not reinterpret storage reference fields as native participants', () => {
    const proxy = bindEntityRefOperationProxy(
      createEntityRef(Invite, { token: 'one' }),
      {
        inspect: { input: graphSchema.object({ parent: field.ref(Invite) }) },
      },
      { run: ({ input }) => input },
    );
    expect(proxy.inspect()).toEqual({ token: 'one' });
  });

  it('binds local methods without changing portable Ref identity', () => {
    const book = bindEntityRefMethods(createEntityRef('Book', { slug: 'progbook' }), {
      describe: ref => `${ref.entityName}:${ref.locator.slug}`,
    });

    expect(book.describe()).toBe('Book:progbook');
    expect(book).toMatchObject({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: { slug: 'progbook' },
    });
  });

  it('binds operation and relation affordances through explicit runners', () => {
    const operationRef = bindEntityRefOperationProxy(
      createEntityRef('Book', { slug: 'progbook' }),
      { rename: { id: 'Book.rename' } },
      {
        run: ({ operation, input }) => ({ operation, input }),
      },
    );
    const relationRef = bindEntityRefRelationOperations(
      createEntityRef('Book', { slug: 'progbook' }),
      'authors',
      { add: { id: 'Book.authors.add' } },
      {
        receiver: 'book',
        run: ({ operation, input }) => ({ operation, input }),
      },
    );

    expect(operationRef.rename({ title: 'New title' })).toEqual({
      operation: { id: 'Book.rename' },
      input: { slug: 'progbook', title: 'New title' },
    });
    const relationResult = relationRef.authors.add({ authorId: 'author-1' });

    expect(relationResult).toMatchObject({
      operation: { id: 'Book.authors.add' },
      input: {
        authorId: 'author-1',
      },
    });
    expect((relationResult.input as Record<string, unknown>).book).toBe(relationRef);
  });

  it('does not let relation arguments replace a declared receiver', () => {
    const ref = createEntityRef('Book', { slug: 'one' });
    const other = createEntityRef('Book', { slug: 'two' });
    const relationRef = bindEntityRefRelationOperations(
      ref,
      'authors',
      {
        add: {
          receiver: {
            kind: 'input',
            path: 'book',
            entityName: 'Book',
            participant: 'ref',
            requirement: 'portable',
            source: 'declaration',
          },
        },
      },
      { receiver: 'book', run: ({ input }) => input },
    );

    expect(() => relationRef.authors.add({ book: other })).toThrow(
      'must not supply receiver "book"',
    );
  });

  it('rejects Entity-type Operations bound through a relation', () => {
    const relationRef = bindEntityRefRelationOperations(
      createEntityRef('Book', { slug: 'one' }),
      'authors',
      {
        add: {
          receiver: {
            kind: 'entity-type',
            entityName: 'Author',
            source: 'declaration',
          },
        },
      },
      { receiver: 'book', run: ({ input }) => input },
    );

    expect(() => relationRef.authors.add()).toThrow(
      'Entity-type Operations cannot be bound to an Entity Ref.',
    );
  });
});
