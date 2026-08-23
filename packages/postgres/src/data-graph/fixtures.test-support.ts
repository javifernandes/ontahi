import { entity, field, mapEntity, mapRelation } from '@ontahi/core/data-graph';

import { postgresMapping } from './index.js';

export const TodoEntity = entity('Todo', {
  id: field.id(),
  title: field.string(),
  completed: field.boolean(),
});

export const TodoMapping = postgresMapping({
  entity: TodoEntity,
  table: 'todos',
  columns: {
    id: 'todo_id',
    title: 'todo_title',
    completed: 'is_completed',
  },
});

export const defineConformanceGraph = () => {
  const Book = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
    published: field.boolean(),
    note: field.nullable(field.string()),
  })
    .locators({ refById: 'id' })
    .identity('refById');
  const Chapter = entity('Chapter', {
    id: field.id(),
    bookId: field.id(),
    title: field.string(),
    position: field.number(),
  });
  const Block = entity('Block', {
    id: field.id(),
    chapterId: field.id(),
    content: field.string(),
    position: field.number(),
  });
  const ChapterWithBlocks = Chapter.hasMany('blocks', Block);
  const BookWithChapters = Book.hasMany('chapters', ChapterWithBlocks);

  mapEntity(BookWithChapters).toTable('books');
  mapEntity(ChapterWithBlocks).toTable('chapters', {
    bookId: 'book_id',
  });
  mapEntity(Block).toTable('blocks', {
    chapterId: 'chapter_id',
  });
  mapRelation(BookWithChapters, 'chapters', {
    type: 'one-to-many',
    from: 'books.id',
    to: 'chapters.book_id',
  });
  mapRelation(ChapterWithBlocks, 'blocks', {
    type: 'one-to-many',
    from: 'chapters.id',
    to: 'blocks.chapter_id',
  });

  return {
    Book,
    Chapter,
    Block,
    ChapterWithBlocks,
    BookWithChapters,
    mappings: [
      postgresMapping({
        entity: BookWithChapters,
        table: 'books',
        columns: {
          id: 'id',
          slug: 'slug',
          title: 'title',
          published: 'published',
          note: 'note',
        },
      }),
      postgresMapping({
        entity: ChapterWithBlocks,
        table: 'chapters',
        columns: {
          id: 'id',
          bookId: 'book_id',
          title: 'title',
          position: 'position',
        },
      }),
      postgresMapping({
        entity: Block,
        table: 'blocks',
        columns: {
          id: 'id',
          chapterId: 'chapter_id',
          content: 'content',
          position: 'position',
        },
      }),
    ],
  };
};

export const conformanceGraph = defineConformanceGraph();

export const conformanceDataset = {
  Book: [
    { id: 'book-1', slug: 'alpha', title: 'Alpha', published: false, note: null },
    { id: 'book-2', slug: 'beta', title: 'Beta', published: true, note: 'featured' },
  ],
  Chapter: [
    { id: 'chapter-2', bookId: 'book-1', title: 'Second', position: 2 },
    { id: 'chapter-1', bookId: 'book-1', title: 'First', position: 1 },
  ],
  Block: [
    { id: 'block-2', chapterId: 'chapter-1', content: 'world', position: 2 },
    { id: 'block-1', chapterId: 'chapter-1', content: 'hello', position: 1 },
  ],
};
