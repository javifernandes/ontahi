import { describe, expect, it } from 'vitest';

import {
  createEntityLocatorRefs,
  createEntityRef,
  createGraphClientCache,
  entity,
  field,
  graphOutput,
} from '../../index.js';

const defineBookEntity = () =>
  entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
  })
    .locators({
      refById: 'id',
      refBySlug: 'slug',
    })
    .identity('refById');

describe('data-graph client cache', () => {
  it('stores materialized entities by canonical identity and learns locator aliases', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache({
      now: () => 1_700_000_000_000,
    });
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };

    const result = cache.writeEntity(Book, book);

    expect(result?.ref).toEqual(createEntityRef(Book, { id: 'book-1' }));
    expect(result?.cachedAt).toBe(1_700_000_000_000);
    expect(result?.aliases).toEqual([
      createEntityRef(Book, { id: 'book-1' }),
      createEntityRef(Book, { slug: 'progbook' }),
    ]);
    expect(cache.readEntity(createEntityRef(Book, { id: 'book-1' }))).toBe(book);
    expect(cache.readEntityRecord(createEntityRef(Book, { slug: 'progbook' }))).toEqual({
      cachedAt: 1_700_000_000_000,
      ref: createEntityRef(Book, { id: 'book-1' }),
      value: book,
    });
    expect(cache.readEntity(createEntityRef(Book, { slug: 'progbook' }))).toBe(book);
    expect(cache.resolveEntityRef(createEntityRef(Book, { slug: 'progbook' }))).toEqual(
      createEntityRef(Book, { id: 'book-1' }),
    );
  });

  it('stores entity freshness timestamps derived from domain metadata', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
      updatedAt: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById')
      .freshness({
        updatedAt: 'updatedAt',
      });
    const cache = createGraphClientCache({
      now: () => 1_700_000_000_000,
    });
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
      updatedAt: '2026-01-02T03:04:05.000Z',
    };

    const result = cache.writeEntity(Book, book);

    expect(result).toEqual({
      aliases: [createEntityRef(Book, { id: 'book-1' })],
      cachedAt: 1_700_000_000_000,
      freshnessAt: Date.parse('2026-01-02T03:04:05.000Z'),
      ref: createEntityRef(Book, { id: 'book-1' }),
      value: book,
    });
    expect(cache.readEntityRecord(createEntityRef(Book, { id: 'book-1' }))).toEqual({
      cachedAt: 1_700_000_000_000,
      freshnessAt: Date.parse('2026-01-02T03:04:05.000Z'),
      ref: createEntityRef(Book, { id: 'book-1' }),
      value: book,
    });
  });

  it('stores entity freshness version and hash markers derived from domain metadata', () => {
    const ContentNode = entity('ContentNode', {
      id: field.id(),
      title: field.string(),
      version: field.string(),
      contentHash: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById')
      .freshness({
        hash: 'contentHash',
        version: 'version',
      });
    const cache = createGraphClientCache();
    const node = {
      id: 'node-1',
      title: 'Intro',
      version: 'v1',
      contentHash: 'hash-1',
    };

    const result = cache.writeEntity(ContentNode, node);

    expect(result).toEqual({
      aliases: [createEntityRef(ContentNode, { id: 'node-1' })],
      cachedAt: expect.any(Number),
      freshnessHash: 'hash-1',
      freshnessVersion: 'v1',
      ref: createEntityRef(ContentNode, { id: 'node-1' }),
      value: node,
    });
  });

  it('merges same-version snapshots without degrading richer cached entity values', () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      subtitle: field.nullable(field.string()),
      version: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById')
      .freshness({
        version: 'version',
      });
    const cache = createGraphClientCache();
    const richBook = {
      id: 'book-1',
      title: 'Programming Book',
      subtitle: 'A rich cached projection',
      version: 'v1',
    };
    const partialBook = {
      id: 'book-1',
      title: 'Programming Book',
      version: 'v1',
    };

    cache.writeEntity(Book, richBook);
    const result = cache.writeEntity(Book, partialBook);

    expect(result?.value).toEqual(richBook);
    expect(cache.readEntity(createEntityRef(Book, { id: 'book-1' }))).toEqual(richBook);
  });

  it('replaces cached entity values when freshness versions change', () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      subtitle: field.nullable(field.string()),
      version: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById')
      .freshness({
        version: 'version',
      });
    const cache = createGraphClientCache();
    const previousBook = {
      id: 'book-1',
      title: 'Programming Book',
      subtitle: 'Old projection',
      version: 'v1',
    };
    const nextBook = {
      id: 'book-1',
      title: 'Programming Book, second edition',
      version: 'v2',
    };

    cache.writeEntity(Book, previousBook);
    const result = cache.writeEntity(Book, nextBook);

    expect(result?.value).toEqual(nextBook);
    expect(cache.readEntity(createEntityRef(Book, { id: 'book-1' }))).toEqual(nextBook);
  });

  it('exposes an inspectable snapshot for devtools and debugging', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };

    cache.writeEntity(Book, book);

    expect(cache.inspect()).toEqual({
      version: 1,
      records: [
        {
          cachedAt: expect.any(Number),
          key: 'Book:{"id":"book-1"}',
          ref: createEntityRef(Book, { id: 'book-1' }),
          value: book,
          aliases: [
            createEntityRef(Book, { id: 'book-1' }),
            createEntityRef(Book, { slug: 'progbook' }),
          ],
        },
      ],
      outputs: [],
      aliases: [
        {
          key: 'Book:{"id":"book-1"}',
          ref: createEntityRef(Book, { id: 'book-1' }),
          canonicalKey: 'Book:{"id":"book-1"}',
          canonicalRef: createEntityRef(Book, { id: 'book-1' }),
        },
        {
          key: 'Book:{"slug":"progbook"}',
          ref: createEntityRef(Book, { slug: 'progbook' }),
          canonicalKey: 'Book:{"id":"book-1"}',
          canonicalRef: createEntityRef(Book, { id: 'book-1' }),
        },
      ],
    });
  });

  it('notifies subscribers when records are written or cleared', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const events: unknown[] = [];
    const unsubscribe = cache.subscribe(event => {
      events.push(event);
    });
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };

    cache.writeEntity(Book, book);
    cache.clear();
    unsubscribe();
    cache.writeEntity(Book, {
      id: 'book-2',
      slug: 'oopbook',
      title: 'Objects Book',
    });

    expect(events).toEqual([
      {
        type: 'write',
        version: 1,
        write: {
          cachedAt: expect.any(Number),
          ref: createEntityRef(Book, { id: 'book-1' }),
          value: book,
          aliases: [
            createEntityRef(Book, { id: 'book-1' }),
            createEntityRef(Book, { slug: 'progbook' }),
          ],
        },
      },
      {
        type: 'clear',
        version: 2,
      },
    ]);
    expect(cache.inspect().version).toBe(3);
  });

  it('invalidates a materialized entity by any learned ref alias', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };
    const idRef = createEntityRef(Book, { id: 'book-1' });
    const slugRef = createEntityRef(Book, { slug: 'progbook' });

    cache.writeEntity(Book, book);
    const invalidation = cache.invalidateEntity(slugRef);

    expect(invalidation).toEqual({
      cachedAt: expect.any(Number),
      ref: idRef,
      value: book,
      aliases: [idRef, slugRef],
    });
    expect(cache.hasEntity(idRef)).toBe(false);
    expect(cache.hasEntity(slugRef)).toBe(false);
    expect(cache.readEntity(idRef)).toBeUndefined();
    expect(cache.readEntity(slugRef)).toBeUndefined();
    expect(cache.resolveEntityRef(slugRef)).toBe(slugRef);
    expect(cache.inspect()).toEqual({
      version: 2,
      records: [],
      outputs: [],
      aliases: [],
    });
  });

  it('notifies subscribers when an entity is invalidated', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };
    const idRef = createEntityRef(Book, { id: 'book-1' });
    const slugRef = createEntityRef(Book, { slug: 'progbook' });

    cache.writeEntity(Book, book);

    const events: unknown[] = [];
    const unsubscribe = cache.subscribe(event => {
      events.push(event);
    });

    cache.invalidateEntity(slugRef);
    unsubscribe();
    cache.writeEntity(Book, {
      id: 'book-2',
      slug: 'oopbook',
      title: 'Objects Book',
    });

    expect(events).toEqual([
      {
        type: 'invalidate',
        version: 2,
        invalidation: {
          cachedAt: expect.any(Number),
          ref: idRef,
          value: book,
          aliases: [idRef, slugRef],
        },
      },
    ]);
    expect(cache.inspect().version).toBe(3);
  });

  it('does not emit an invalidation event for an unknown ref', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const events: unknown[] = [];

    cache.subscribe(event => {
      events.push(event);
    });

    expect(cache.invalidateEntity(createEntityRef(Book, { slug: 'missing-book' }))).toBeUndefined();
    expect(events).toEqual([]);
    expect(cache.inspect().version).toBe(0);
  });

  it('keeps unknown refs unresolved and unreadable', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const unknownRef = createEntityRef(Book, { slug: 'missing-book' });

    expect(cache.readEntity(unknownRef)).toBeUndefined();
    expect(cache.hasEntity(unknownRef)).toBe(false);
    expect(cache.resolveEntityRef(unknownRef)).toBe(unknownRef);
  });

  it('does not store entities without enough canonical identity data', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();

    expect(cache.writeEntity(Book, { slug: 'progbook' })).toBeUndefined();
    expect(cache.hasEntity(createEntityRef(Book, { slug: 'progbook' }))).toBe(false);
  });

  it('replaces stale aliases when the same canonical entity is written again', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const initialBook = {
      id: 'book-1',
      slug: 'old-slug',
      title: 'Old title',
    };
    const updatedBook = {
      id: 'book-1',
      slug: 'new-slug',
      title: 'New title',
    };

    cache.writeEntity(Book, initialBook);
    cache.writeEntity(Book, updatedBook);

    expect(cache.readEntity(createEntityRef(Book, { id: 'book-1' }))).toBe(updatedBook);
    expect(cache.readEntity(createEntityRef(Book, { slug: 'new-slug' }))).toBe(updatedBook);
    expect(cache.readEntity(createEntityRef(Book, { slug: 'old-slug' }))).toBeUndefined();
    expect(cache.resolveEntityRef(createEntityRef(Book, { slug: 'old-slug' }))).toEqual(
      createEntityRef(Book, { slug: 'old-slug' }),
    );
  });

  it('clears records, canonical refs, and aliases', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const slugRef = createEntityRef(Book, { slug: 'progbook' });

    cache.writeEntity(Book, {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    });
    cache.clear();

    expect(cache.hasEntity(slugRef)).toBe(false);
    expect(cache.readEntity(slugRef)).toBeUndefined();
    expect(cache.resolveEntityRef(slugRef)).toBe(slugRef);
  });

  it('supports composite canonical identities', () => {
    const TaskRun = entity('TaskRun', {
      taskId: field.string(),
      runId: field.string(),
      status: field.string(),
    })
      .locators({
        refByTaskAndRun: ['taskId', 'runId'],
      })
      .identity('refByTaskAndRun');
    const cache = createGraphClientCache();
    const taskRun = {
      taskId: 'book.import',
      runId: 'run-1',
      status: 'completed',
    };

    cache.writeEntity(TaskRun, taskRun);

    expect(
      cache.readEntity(
        createEntityRef(TaskRun, {
          taskId: 'book.import',
          runId: 'run-1',
        }),
      ),
    ).toBe(taskRun);
  });

  it('derives locator refs only when their declared fields are materialized', () => {
    const bookChapterPathLocator = Object.assign(
      (bookSlug: string, partSlug: string | null, chapterSlug: string) => ({
        bookSlug,
        partSlug,
        chapterSlug,
      }),
      {
        fields: ['bookSlug', 'partSlug', 'chapterSlug'] as const,
      },
    );
    const ContentNode = entity('ContentNode', {
      id: field.id(),
      bookSlug: field.string(),
      partSlug: field.nullable(field.string()),
      chapterSlug: field.string(),
      title: field.string(),
    }).locators({
      refById: 'id',
      refByBookChapterPath: bookChapterPathLocator,
    });

    expect(
      createEntityLocatorRefs(ContentNode, {
        id: 'node-1',
        bookSlug: 'progbook',
        partSlug: null,
        chapterSlug: 'intro',
        title: 'Intro',
      }),
    ).toEqual([
      {
        name: 'refById',
        ref: createEntityRef(ContentNode, { id: 'node-1' }),
      },
      {
        name: 'refByBookChapterPath',
        ref: createEntityRef(ContentNode, {
          bookSlug: 'progbook',
          partSlug: null,
          chapterSlug: 'intro',
        }),
      },
    ]);
    expect(
      createEntityLocatorRefs(ContentNode, {
        id: 'node-1',
        bookSlug: 'progbook',
        title: 'Intro',
      }),
    ).toEqual([
      {
        name: 'refById',
        ref: createEntityRef(ContentNode, { id: 'node-1' }),
      },
    ]);
  });

  it('normalizes direct entity outputs into canonical records and locator aliases', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };

    const result = cache.normalizeOutput(graphOutput.entity(Book), book);

    expect(result.writes).toHaveLength(1);
    expect(result.writes[0]?.ref).toEqual(createEntityRef(Book, { id: 'book-1' }));
    expect(cache.readEntity(createEntityRef(Book, { id: 'book-1' }))).toBe(book);
    expect(cache.readEntity(createEntityRef(Book, { slug: 'progbook' }))).toBe(book);
  });

  it('normalizes arrays of entity outputs', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const books = [
      {
        id: 'book-1',
        slug: 'progbook',
        title: 'Programming Book',
      },
      {
        id: 'book-2',
        slug: 'oopbook',
        title: 'Objects Book',
      },
    ];

    const result = cache.normalizeOutput(graphOutput.array(graphOutput.entity(Book)), books);

    expect(result.writes.map(write => write.ref)).toEqual([
      createEntityRef(Book, { id: 'book-1' }),
      createEntityRef(Book, { id: 'book-2' }),
    ]);
    expect(cache.readEntity(createEntityRef(Book, { slug: 'oopbook' }))).toBe(books[1]);
  });

  it('normalizes nested entity outputs inside object projections', () => {
    const Book = defineBookEntity();
    const CommentThread = entity('CommentThread', {
      id: field.id(),
      bookId: field.string(),
      title: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById');
    const cache = createGraphClientCache();
    const output = {
      book: {
        id: 'book-1',
        slug: 'progbook',
        title: 'Programming Book',
      },
      items: [
        {
          thread: {
            id: 'thread-1',
            bookId: 'book-1',
            title: 'First thread',
          },
          unreadCount: 2,
        },
      ],
      nextCursor: null,
    };

    const result = cache.normalizeOutput(
      graphOutput.object({
        book: graphOutput.entity(Book),
        items: graphOutput.array(
          graphOutput.object({
            thread: graphOutput.entity(CommentThread),
          }),
        ),
      }),
      output,
    );

    expect(result.writes.map(write => write.ref)).toEqual([
      createEntityRef(Book, { id: 'book-1' }),
      createEntityRef(CommentThread, { id: 'thread-1' }),
    ]);
    expect(cache.readEntity(createEntityRef(Book, { slug: 'progbook' }))).toBe(output.book);
    expect(cache.readEntity(createEntityRef(CommentThread, { id: 'thread-1' }))).toBe(
      output.items[0]?.thread,
    );
  });

  it('returns a normalized output tree with entity refs for buried entity snapshots', () => {
    const Book = defineBookEntity();
    const CommentThread = entity('CommentThread', {
      id: field.id(),
      bookId: field.string(),
      title: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById');
    const cache = createGraphClientCache();
    const output = {
      items: [
        {
          thread: {
            id: 'thread-1',
            bookId: 'book-1',
            title: 'First thread',
          },
          relatedBooks: [
            {
              id: 'book-1',
              slug: 'progbook',
              title: 'Programming Book',
            },
          ],
        },
      ],
    };

    const result = cache.normalizeOutput(
      graphOutput.object({
        items: graphOutput.array(
          graphOutput.object({
            thread: graphOutput.entity(CommentThread),
            relatedBooks: graphOutput.array(graphOutput.entity(Book)),
          }),
        ),
      }),
      output,
    );

    expect(result.value).toEqual({
      items: [
        {
          thread: createEntityRef(CommentThread, { id: 'thread-1' }),
          relatedBooks: [createEntityRef(Book, { id: 'book-1' })],
        },
      ],
    });
    expect(cache.readEntity(createEntityRef(CommentThread, { id: 'thread-1' }))).toBe(
      output.items[0]?.thread,
    );
    expect(cache.readEntity(createEntityRef(Book, { slug: 'progbook' }))).toBe(
      output.items[0]?.relatedBooks[0],
    );
  });

  it('stores normalized output skeletons for graph-aware query projections', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache({
      now: () => 1_700_000_000_000,
    });
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };
    const descriptor = graphOutput.object({
      books: graphOutput.array(graphOutput.entity(Book)),
    });
    const key = ['Book', 'listBooks', 'featured'] as const;

    const result = cache.writeOutput(key, descriptor, {
      books: [book],
    });

    expect(result.value).toEqual({
      books: [createEntityRef(Book, { id: 'book-1' })],
    });
    expect(cache.readOutput(key, descriptor)).toEqual({
      cachedAt: 1_700_000_000_000,
      initialDataUpdatedAt: 1_700_000_000_000,
      key,
      keyHash: '["Book","listBooks","featured"]',
      value: {
        books: [createEntityRef(Book, { id: 'book-1' })],
      },
    });
  });

  it('does not read output skeletons when a referenced entity is missing', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };
    const descriptor = graphOutput.object({
      books: graphOutput.array(graphOutput.entity(Book)),
    });
    const key = ['Book', 'listBooks', 'featured'] as const;

    cache.writeOutput(key, descriptor, {
      books: [book],
    });
    cache.invalidateEntity(createEntityRef(Book, { id: 'book-1' }));

    expect(cache.readOutput(key, descriptor)).toBeUndefined();
  });

  it('stores output skeletons under canonical entity ref keys learned from the output', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };
    const descriptor = graphOutput.object({
      books: graphOutput.array(graphOutput.entity(Book)),
    });
    const slugKey = ['Book', 'listBooks', createEntityRef(Book, { slug: 'progbook' })] as const;
    const idKey = ['Book', 'listBooks', createEntityRef(Book, { id: 'book-1' })] as const;

    cache.writeOutput(slugKey, descriptor, {
      books: [book],
    });

    expect(cache.inspect().outputs[0]).toMatchObject({
      key: idKey,
      keyHash: '["Book","listBooks",ref(Book:{"id":"book-1"})]',
    });
    expect(cache.readOutput(idKey, descriptor)?.value).toEqual({
      books: [createEntityRef(Book, { id: 'book-1' })],
    });
  });

  it('normalizes entity outputs with nested entity fields', () => {
    const CommentThread = entity('CommentThread', {
      id: field.id(),
      title: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById');
    const CommentMessage = entity('CommentMessage', {
      id: field.id(),
      threadId: field.id(),
      body: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById');
    const cache = createGraphClientCache();
    const thread = {
      id: 'thread-1',
      title: 'First thread',
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          body: 'Hello',
        },
      ],
    };

    const result = cache.normalizeOutput(
      graphOutput.entity(CommentThread, {
        messages: graphOutput.array(graphOutput.entity(CommentMessage)),
      }),
      thread,
    );

    expect(result.writes.map(write => write.ref)).toEqual([
      createEntityRef(CommentThread, { id: 'thread-1' }),
      createEntityRef(CommentMessage, { id: 'message-1' }),
    ]);
    expect(cache.readEntity(createEntityRef(CommentThread, { id: 'thread-1' }))).toBe(thread);
    expect(cache.readEntity(createEntityRef(CommentMessage, { id: 'message-1' }))).toBe(
      thread.messages[0],
    );
  });

  it('denormalizes direct entity outputs from the latest canonical record', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const staleBook = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Stale title',
    };
    const freshBook = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Fresh title',
    };

    cache.writeEntity(Book, freshBook);

    expect(cache.denormalizeOutput(graphOutput.entity(Book), staleBook)).toBe(freshBook);
  });

  it('denormalizes entity outputs through learned aliases', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const cachedBook = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
    };

    cache.writeEntity(Book, cachedBook);

    expect(
      cache.denormalizeOutput(graphOutput.entity(Book), {
        slug: 'progbook',
        title: 'Partial book',
      }),
    ).toBe(cachedBook);
  });

  it('denormalizes arrays and object projections without mutating the source output', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const cachedBook = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Fresh title',
    };
    const output = {
      books: [
        {
          id: 'book-1',
          slug: 'progbook',
          title: 'Stale title',
        },
      ],
      total: 1,
    };

    cache.writeEntity(Book, cachedBook);

    const denormalized = cache.denormalizeOutput(
      graphOutput.object({
        books: graphOutput.array(graphOutput.entity(Book)),
      }),
      output,
    );

    expect(denormalized).toEqual({
      books: [cachedBook],
      total: 1,
    });
    expect(denormalized).not.toBe(output);
    expect(output.books[0]?.title).toBe('Stale title');
  });

  it('denormalizes normalized output trees containing entity refs', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const cachedBook = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Cached Programming Book',
    };

    cache.writeEntity(Book, cachedBook);

    expect(
      cache.denormalizeOutput(
        graphOutput.object({
          books: graphOutput.array(graphOutput.entity(Book)),
        }),
        {
          books: [createEntityRef(Book, { slug: 'progbook' })],
        },
      ),
    ).toEqual({
      books: [cachedBook],
    });
  });

  it('denormalizes nested entity fields from their canonical records', () => {
    const CommentThread = entity('CommentThread', {
      id: field.id(),
      title: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById');
    const CommentMessage = entity('CommentMessage', {
      id: field.id(),
      threadId: field.id(),
      body: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById');
    const cache = createGraphClientCache();
    const cachedMessage = {
      id: 'message-1',
      threadId: 'thread-1',
      body: 'Fresh body',
    };
    const thread = {
      id: 'thread-1',
      title: 'First thread',
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          body: 'Stale body',
        },
      ],
    };

    cache.writeEntity(CommentMessage, cachedMessage);

    const denormalized = cache.denormalizeOutput(
      graphOutput.entity(CommentThread, {
        messages: graphOutput.array(graphOutput.entity(CommentMessage)),
      }),
      thread,
    );

    expect(denormalized).toEqual({
      id: 'thread-1',
      title: 'First thread',
      messages: [cachedMessage],
    });
  });

  it('skips nullable and optional output branches when no value is present', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();

    const result = cache.normalizeOutput(
      graphOutput.object({
        current: graphOutput.nullable(graphOutput.entity(Book)),
        next: graphOutput.optional(graphOutput.entity(Book)),
      }),
      {
        current: null,
      },
    );

    expect(result.writes).toEqual([]);
  });

  it('does not normalize entity outputs without enough canonical identity data', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();

    const result = cache.normalizeOutput(graphOutput.entity(Book), {
      slug: 'progbook',
      title: 'Programming Book',
    });

    expect(result.writes).toEqual([]);
    expect(cache.readEntity(createEntityRef(Book, { slug: 'progbook' }))).toBeUndefined();
  });
});
