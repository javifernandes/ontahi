import { describe, expect, it } from 'vitest';

import {
  bindEntityRefOperationProxy,
  bindEntityRefRelationOperations,
  bindEntityRefMethods,
  attachEntityRefInputRefs,
  createEntityRef,
  createEntityIdentityRef,
  createEntityRefFactory,
  defineEntityRefInput,
  entity,
  entityRefsEqual,
  field,
  getEntityIdentityLocator,
  getDefaultEntityRefOperationInput,
  isEntityRef,
  normalizeEntityRefInput,
  normalizeEntityRefQueryInput,
  normalizeEntityRef,
  readEntityRefQueryInputValue,
} from '../../../src/data-graph/index.js';

describe('data-graph entity refs', () => {
  it('creates normalized refs from entity definitions or names', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });

    const fromEntity = createEntityRef(Book, { id: 'book-1' });
    const fromName = createEntityRef('Book', { id: 'book-1' });

    expect(fromEntity).toEqual({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: { id: 'book-1' },
    });
    expect(normalizeEntityRef(fromEntity)).toBe('Book:{"id":"book-1"}');
    expect(entityRefsEqual(fromEntity, fromName)).toBe(true);
  });

  it('derives canonical identity refs from entity identity locators', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    })
      .locators({
        refById: 'id',
        refBySlug: 'slug',
      })
      .identity('refById');

    expect(Book.identityLocatorName).toBe('refById');
    expect(
      createEntityIdentityRef(Book, {
        id: 'book-1',
        slug: 'progbook',
      }),
    ).toEqual(createEntityRef(Book, { id: 'book-1' }));
    expect(createEntityIdentityRef(Book, { slug: 'progbook' })).toBeUndefined();
  });

  it('rejects unknown identity locators', () => {
    const Book = entity('Book', {
      id: field.id(),
    }).locators({
      refById: 'id',
    });

    expect(() => (Book as any).identity('refBySlug')).toThrow(
      'Unknown identity locator refBySlug on entity Book',
    );
  });

  it('derives canonical identity refs from composite identity locators', () => {
    const TaskRun = entity('TaskRun', {
      taskId: field.string(),
      runId: field.string(),
      status: field.string(),
    })
      .locators({
        refByTaskAndRun: ['taskId', 'runId'],
      })
      .identity('refByTaskAndRun');

    expect(getEntityIdentityLocator(TaskRun)?.name).toBe('refByTaskAndRun');
    expect(
      createEntityIdentityRef(TaskRun, {
        taskId: 'book.import',
        runId: 'run-1',
        status: 'completed',
      }),
    ).toEqual(
      createEntityRef(TaskRun, {
        taskId: 'book.import',
        runId: 'run-1',
      }),
    );
    expect(
      createEntityIdentityRef(TaskRun, {
        taskId: 'book.import',
        status: 'completed',
      }),
    ).toBeUndefined();
  });

  it('reads entity ref query values from direct refs, projected fields, and nested locators', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });
    const inputRef = defineEntityRefInput(Book);

    expect(
      readEntityRefQueryInputValue(
        {
          book: createEntityRef(Book, {
            slug: 'progbook',
          }),
        },
        'book',
        inputRef,
      ),
    ).toBe('Book:{"slug":"progbook"}');
    expect(readEntityRefQueryInputValue({ bookSlug: 'progbook' }, 'book', inputRef)).toBe(
      'progbook',
    );
    expect(readEntityRefQueryInputValue({ book: { slug: 'progbook' } }, 'book', inputRef)).toEqual({
      slug: 'progbook',
    });
  });

  it('normalizes locator objects stably regardless of key order', () => {
    const left = createEntityRef('PendingCollaboratorInvite', {
      token: 'invite-token',
      path: {
        bookSlug: 'progbook',
        chapterSlug: 'intro',
      },
    });
    const right = createEntityRef('PendingCollaboratorInvite', {
      path: {
        chapterSlug: 'intro',
        bookSlug: 'progbook',
      },
      token: 'invite-token',
    });

    expect(normalizeEntityRef(left)).toBe(
      'PendingCollaboratorInvite:{"path":{"bookSlug":"progbook","chapterSlug":"intro"},"token":"invite-token"}',
    );
    expect(entityRefsEqual(left, right)).toBe(true);
  });

  it('binds methods directly onto a ref instance', () => {
    const invite = bindEntityRefMethods(
      createEntityRef('PendingCollaboratorInvite', { token: 'invite-token' }),
      {
        getInviteInfo: ref => ref.locator.token,
        acceptInvite: (ref, actorId: string) => `${actorId}:${ref.locator.token}`,
      },
    );

    expect(invite.getInviteInfo()).toBe('invite-token');
    expect(invite.acceptInvite('user-1')).toBe('user-1:invite-token');
    expect(isEntityRef(invite)).toBe(true);
  });

  it('creates ref factories that can attach methods at construction time', () => {
    const refByToken = createEntityRefFactory('PendingCollaboratorInvite', {
      getInviteInfo: ref => ({
        token: ref.locator.token,
      }),
      acceptInvite: (ref, actorId: string) => ({
        actorId,
        token: ref.locator.token,
      }),
    });

    const invite = refByToken({
      token: 'invite-token',
    });

    expect(invite.entityName).toBe('PendingCollaboratorInvite');
    expect(invite.getInviteInfo()).toEqual({
      token: 'invite-token',
    });
    expect(invite.acceptInvite('user-1')).toEqual({
      actorId: 'user-1',
      token: 'invite-token',
    });
  });

  it('describes operation input refs with receiver and locator variants', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });

    const inputRef = defineEntityRefInput(Book).receiver().by('slug', ['bookSlug']).by('id');

    expect(inputRef).toEqual({
      kind: 'entity-ref-input',
      entityName: 'Book',
      isReceiver: true,
      isOptional: false,
      locators: [
        {
          name: 'slug',
          fields: ['bookSlug'],
        },
        {
          name: 'id',
          fields: ['id'],
        },
      ],
      inferredLocators: [
        {
          name: 'refById',
          fields: ['id'],
          sourceFields: ['id'],
          toLocator: expect.any(Function),
        },
      ],
    });
  });

  it('derives operation input refs from inferred entity-owned locators', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });
    const input = attachEntityRefInputRefs(
      {
        bookSlug: 'progbook',
      },
      {
        book: defineEntityRefInput(Book),
      },
    );

    expect(input.refs.book).toEqual({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
    });
  });

  it('derives operation input refs from plain and nested inferred locator fields', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });

    expect(
      attachEntityRefInputRefs(
        {
          slug: 'plain-slug',
        },
        {
          book: defineEntityRefInput(Book),
        },
      ).refs.book.locator,
    ).toEqual({
      slug: 'plain-slug',
    });

    expect(
      attachEntityRefInputRefs(
        {
          book: {
            slug: 'nested-slug',
          },
        },
        {
          book: defineEntityRefInput(Book),
        },
      ).refs.book.locator,
    ).toEqual({
      slug: 'nested-slug',
    });
  });

  it('derives and normalizes composite entity-owned locators', () => {
    const TaskRun = entity('TaskRun', {
      taskId: field.string(),
      runId: field.string(),
    }).locators({
      refByTaskAndRun: ['taskId', 'runId'],
    });

    const input = attachEntityRefInputRefs(
      {
        taskId: 'book.import-github-markdown',
        runId: 'run-1',
      },
      {
        taskRun: defineEntityRefInput(TaskRun),
      },
    );

    expect(input.refs.taskRun).toEqual({
      kind: 'entity-ref',
      entityName: 'TaskRun',
      locator: {
        taskId: 'book.import-github-markdown',
        runId: 'run-1',
      },
    });

    const normalized = normalizeEntityRefInput(
      {
        taskRun: createEntityRef(TaskRun, {
          taskId: 'book.import-github-markdown',
          runId: 'run-1',
        }),
      },
      {
        taskRun: defineEntityRefInput(TaskRun),
      },
    );

    expect(normalized).toMatchObject({
      taskId: 'book.import-github-markdown',
      runId: 'run-1',
    });
  });

  it('binds semantic resolvers to derived operation input refs', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });
    let resolutionCount = 0;

    const input = attachEntityRefInputRefs(
      {
        bookSlug: 'progbook',
      },
      {
        book: defineEntityRefInput(Book).resolveWith(ref => {
          resolutionCount += 1;
          return {
            entityName: ref.entityName,
            locator: ref.locator,
            title: 'Programming Book',
          };
        }),
      },
    );

    expect(input.refs.book).toEqual({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
    });
    expect(input.refs.book.resolve()).toEqual({
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
      title: 'Programming Book',
    });
    expect(input.refs.book.resolve()).toEqual({
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
      title: 'Programming Book',
    });
    expect(resolutionCount).toBe(1);
  });

  it('can rebind semantic resolvers when the same direct ref is derived more than once', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });
    const bookRef = createEntityRef(Book, {
      slug: 'progbook',
    });
    const inputRefs = {
      book: defineEntityRefInput(Book).resolveWith(ref => ({
        entityName: ref.entityName,
        locator: ref.locator,
      })),
    };

    const first = attachEntityRefInputRefs({ book: bookRef }, inputRefs);
    const second = attachEntityRefInputRefs({ book: bookRef }, inputRefs);

    expect(first.refs.book.resolve()).toEqual({
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
    });
    expect(second.refs.book.resolve()).toEqual({
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
    });
  });

  it('derives operation input refs from direct entity refs', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });
    const bookRef = createEntityRef(Book, {
      slug: 'progbook',
    });

    const input = attachEntityRefInputRefs(
      {
        book: bookRef,
      },
      {
        book: defineEntityRefInput(Book),
      },
    );

    expect(input.refs.book).toBe(bookRef);
  });

  it('normalizes direct entity refs into legacy flat input fields', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });

    const input = normalizeEntityRefInput(
      {
        book: createEntityRef(Book, {
          slug: 'progbook',
        }),
        email: 'reader@example.com',
      },
      {
        book: defineEntityRefInput(Book),
      },
    );

    expect(input).toMatchObject({
      bookSlug: 'progbook',
      slug: 'progbook',
      email: 'reader@example.com',
    });
    expect(input.book).toEqual({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
    });
  });

  it('normalizes direct entity refs into preferred query-key fields', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });

    const input = normalizeEntityRefQueryInput(
      {
        book: createEntityRef(Book, {
          slug: 'progbook',
        }),
        stateFilter: 'open',
      },
      {
        book: defineEntityRefInput(Book),
      },
    );

    expect(input).toEqual({
      bookSlug: 'progbook',
      stateFilter: 'open',
    });
  });

  it('normalizes composite direct entity refs into preferred query-key fields', () => {
    const ContentNode = entity('ContentNode', {
      bookSlug: field.string(),
      partSlug: field.string(),
      chapterSlug: field.string(),
    }).locators({
      refByBookChapterPath: ['bookSlug', 'partSlug', 'chapterSlug'],
    });

    const input = normalizeEntityRefQueryInput(
      {
        chapter: createEntityRef(ContentNode, {
          bookSlug: 'progbook',
          partSlug: 'building-blocks',
          chapterSlug: 'composition',
        }),
        stateFilter: 'all',
      },
      {
        chapter: defineEntityRefInput(ContentNode),
      },
    );

    expect(input).toEqual({
      bookSlug: 'progbook',
      partSlug: 'building-blocks',
      chapterSlug: 'composition',
      stateFilter: 'all',
    });
  });

  it('normalizes direct entity refs for query keys without input ref metadata', () => {
    const input = normalizeEntityRefQueryInput({
      thread: createEntityRef('CommentThread', {
        id: 'thread-1',
      }),
    });

    expect(input).toEqual({
      threadId: 'thread-1',
    });
  });

  it('attaches derived refs to flat operation inputs', () => {
    const inputRefs = {
      book: defineEntityRefInput('Book').receiver().by('slug', ['bookSlug']),
      invitee: defineEntityRefInput('Profile').by('email', ['email']).optional(),
    };
    const input = attachEntityRefInputRefs(
      {
        bookSlug: 'progbook',
        email: 'reader@example.com',
      },
      inputRefs,
    );

    expect(input.refs.book).toEqual({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
    });
    expect(input.refs.invitee).toEqual({
      kind: 'entity-ref',
      entityName: 'Profile',
      locator: {
        email: 'reader@example.com',
      },
    });

    const inputWithoutOptionalInvitee = attachEntityRefInputRefs(
      {
        bookSlug: 'progbook',
      },
      inputRefs,
    );

    expect(inputWithoutOptionalInvitee.refs).toEqual({
      book: {
        kind: 'entity-ref',
        entityName: 'Book',
        locator: {
          slug: 'progbook',
        },
      },
    });
  });

  it('binds all provided operations through a proxy', () => {
    const invite = createEntityRef('PendingCollaboratorInvite', {
      token: 'invite-token',
    });
    const operations = {
      getInviteInfo: {
        id: 'PendingCollaboratorInvite.getInviteInfo',
      },
      acceptInvite: {
        id: 'PendingCollaboratorInvite.acceptInvite',
      },
      inviteCollaborator: {
        id: 'PendingCollaboratorInvite.inviteCollaborator',
      },
    };
    const proxiedInvite = bindEntityRefOperationProxy(invite, operations, {
      run: ({ operation, input }) => ({
        operationId: operation.id,
        input,
      }),
    });

    expect(proxiedInvite.getInviteInfo()).toEqual({
      operationId: 'PendingCollaboratorInvite.getInviteInfo',
      input: {
        token: 'invite-token',
      },
    });
    expect(proxiedInvite.acceptInvite()).toEqual({
      operationId: 'PendingCollaboratorInvite.acceptInvite',
      input: {
        token: 'invite-token',
      },
    });
    expect(
      proxiedInvite.inviteCollaborator({ bookSlug: 'progbook', email: 'reader@example.com' }),
    ).toEqual({
      operationId: 'PendingCollaboratorInvite.inviteCollaborator',
      input: {
        token: 'invite-token',
        bookSlug: 'progbook',
        email: 'reader@example.com',
      },
    });
  });

  it('projects relation operations from an entity ref receiver', () => {
    const book = createEntityRef('Book', {
      slug: 'progbook',
    });
    const operations = {
      invite: {
        id: 'BookCollaborators.invite',
      },
    };
    const bookWithCollaborators = bindEntityRefRelationOperations(
      book,
      'collaborators',
      operations,
      {
        receiver: 'book',
        run: ({ operation, input }) => ({
          operationId: operation.id,
          input,
        }),
      },
    );

    expect(bookWithCollaborators.collaborators.invite({ email: 'reader@example.com' })).toEqual({
      operationId: 'BookCollaborators.invite',
      input: {
        book,
        email: 'reader@example.com',
      },
    });
  });

  it('derives default operation input from locator and the first object argument', () => {
    const ref = createEntityRef('Book', {
      slug: 'progbook',
    });

    expect(getDefaultEntityRefOperationInput(ref, [])).toEqual({
      slug: 'progbook',
    });
    expect(
      getDefaultEntityRefOperationInput(ref, [
        {
          email: 'reader@example.com',
        },
      ]),
    ).toEqual({
      slug: 'progbook',
      email: 'reader@example.com',
    });
  });

  it('allows proxy operations to override default input mapping', () => {
    const book = createEntityRef('Book', {
      slug: 'progbook',
    });
    const operations = {
      inviteCollaborator: {
        id: 'Book.inviteCollaborator',
      },
    };
    const proxiedBook = bindEntityRefOperationProxy(book, operations, {
      input: ({ ref, args }) => ({
        ...ref.locator,
        ...(args[0] as Record<string, unknown>),
      }),
      run: ({ operation, input }) => ({
        operationId: operation.id,
        input,
      }),
    });

    expect(proxiedBook.inviteCollaborator({ email: 'reader@example.com' })).toEqual({
      operationId: 'Book.inviteCollaborator',
      input: {
        slug: 'progbook',
        email: 'reader@example.com',
      },
    });
  });
});
