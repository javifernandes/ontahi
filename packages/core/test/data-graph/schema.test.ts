import { describe, expect, it } from 'vitest';

import {
  defineDomainOperationMetadata,
  entity,
  field,
  graphOutput,
  graphSchema,
  resolveDomainOperations,
  toGraphOutputDescriptor,
  toZodSchema,
  value,
} from '../../src/data-graph/index.js';

describe('data-graph schema DSL', () => {
  it('uses entity definitions as graph schemas and Zod adapter inputs', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');

    const schema = toZodSchema(Book);

    expect(schema.parse({ id: 'book-1', slug: 'progbook', title: 'Progbook' })).toEqual({
      id: 'book-1',
      slug: 'progbook',
      title: 'Progbook',
    });
    expect(toGraphOutputDescriptor(Book)).toEqual(graphOutput.entity(Book));
    expect(toGraphOutputDescriptor(toZodSchema(Book) as never)).toEqual(graphOutput.entity(Book));
  });

  it('preserves basic field constraints when generating Zod schemas', () => {
    const BookStats = value('BookStats', {
      id: field.id(),
      slug: field.slug(),
      title: field.nonEmptyString(),
      chapterCount: field.nonNegativeInteger(),
      pageCount: field.positiveInteger({ max: 5000 }),
    });
    const schema = toZodSchema(BookStats);

    expect(
      schema.parse({
        id: 'book-1',
        slug: 'progbook',
        title: 'Programming',
        chapterCount: 0,
        pageCount: 120,
      }),
    ).toEqual({
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming',
      chapterCount: 0,
      pageCount: 120,
    });
    expect(() =>
      schema.parse({
        id: '',
        slug: 'progbook',
        title: 'Programming',
        chapterCount: 0,
        pageCount: 120,
      }),
    ).toThrow();
    expect(() =>
      schema.parse({
        id: 'book-1',
        slug: 'progbook',
        title: '',
        chapterCount: -1,
        pageCount: 120,
      }),
    ).toThrow();
    expect(() =>
      schema.parse({
        id: 'book-1',
        slug: 'progbook',
        title: 'Programming',
        chapterCount: 0.5,
        pageCount: 120,
      }),
    ).toThrow();
    expect(() =>
      schema.parse({
        id: 'book-1',
        slug: 'progbook',
        title: 'Programming',
        chapterCount: 0,
        pageCount: 5001,
      }),
    ).toThrow();
  });

  it('defines entity views that include entity fields by default and add derived fields', () => {
    const CommentMessage = entity('CommentMessage', {
      id: field.id(),
      threadId: field.id(),
      body: field.string(),
      internalModerationFlag: field.boolean(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const ThreadMessageAuthor = value('ThreadMessageAuthor', {
      id: field.id(),
      displayName: field.nullable(field.string()),
    });
    const ThreadMessage = CommentMessage.view('ThreadMessage', {
      omit: ['internalModerationFlag'] as const,
      fields: {
        author: ThreadMessageAuthor,
      },
    });

    const schema = toZodSchema(ThreadMessage);

    expect(
      schema.parse({
        id: 'message-1',
        threadId: 'thread-1',
        body: 'hello',
        author: {
          id: 'user-1',
          displayName: null,
        },
      }),
    ).toEqual({
      id: 'message-1',
      threadId: 'thread-1',
      body: 'hello',
      author: {
        id: 'user-1',
        displayName: null,
      },
    });
    expect(() =>
      schema.parse({
        id: 'message-1',
        threadId: 'thread-1',
        body: 'hello',
      }),
    ).toThrow();
    expect(toGraphOutputDescriptor(ThreadMessage)).toEqual(graphOutput.entity(CommentMessage));
  });

  it('derives normalized output metadata from graph values with nested entity views', () => {
    const CommentMessage = entity('CommentMessage', {
      id: field.id(),
      body: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const CommentThread = entity('CommentThread', {
      id: field.id(),
      state: field.enum(['open', 'resolved'] as const),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const ThreadMessage = CommentMessage.view('ThreadMessage');
    const ConversationThread = CommentThread.view('ConversationThread', {
      fields: {
        messages: graphSchema.array(ThreadMessage),
      },
    });
    const ListThreadsForChapterResult = value('ListThreadsForChapterResult', {
      threads: graphSchema.array(ConversationThread),
    });

    expect(toGraphOutputDescriptor(ListThreadsForChapterResult)).toEqual(
      graphOutput.object({
        threads: graphOutput.array(
          graphOutput.entity(CommentThread, {
            messages: graphOutput.array(graphOutput.entity(CommentMessage)),
          }),
        ),
      }),
    );
    expect(
      toZodSchema(ListThreadsForChapterResult).parse({
        threads: [
          {
            id: 'thread-1',
            state: 'open',
            messages: [{ id: 'message-1', body: 'hello' }],
          },
        ],
      }),
    ).toEqual({
      threads: [
        {
          id: 'thread-1',
          state: 'open',
          messages: [{ id: 'message-1', body: 'hello' }],
        },
      ],
    });
  });

  it('lets domain operations use graph-native schemas as output contracts', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const FetchBooksResult = value('FetchBooksResult', {
      books: graphSchema.array(Book),
    });

    const operations = resolveDomainOperations('Book', {
      fetchBooks: defineDomainOperationMetadata({
        exposure: 'bridge',
        output: FetchBooksResult,
      }),
    });

    expect(operations.fetchBooks.output).toBe(FetchBooksResult);
    expect(operations.fetchBooks.graphOutput).toEqual(
      graphOutput.object({
        books: graphOutput.array(graphOutput.entity(Book)),
      }),
    );
  });
});
