import { entity, field, mapEntity, mapRelation } from '@ontahi/core/data-graph';

export const defineReaderGraph = () => {
  const Book = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
  });
  const Chapter = entity('Chapter', {
    id: field.id(),
    bookId: field.id(),
    title: field.string(),
    order: field.number(),
  });
  const Block = entity('Block', {
    id: field.id(),
    chapterId: field.id(),
    order: field.number(),
    content: field.string(),
  });

  const ChapterWithBlocks = Chapter.hasMany('blocks', Block);
  const BookWithChapters = Book.hasMany('chapters', ChapterWithBlocks);

  mapEntity(BookWithChapters).toTable('books');
  mapEntity(ChapterWithBlocks).toTable('chapters', { bookId: 'book_id' });
  mapEntity(Block).toTable('blocks', { chapterId: 'chapter_id' });

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
  };
};

export const readerDataset = {
  Book: [{ id: 'book-1', slug: 'progbook', title: 'Progbook' }],
  Chapter: [
    { id: 'chapter-2', bookId: 'book-1', title: 'Second', order: 2 },
    { id: 'chapter-1', bookId: 'book-1', title: 'First', order: 1 },
  ],
  Block: [
    { id: 'block-2', chapterId: 'chapter-1', order: 2, content: 'world' },
    { id: 'block-1', chapterId: 'chapter-1', order: 1, content: 'hello' },
  ],
};

export const expectedReaderResult = {
  id: 'book-1',
  slug: 'progbook',
  title: 'Progbook',
  chapters: [
    {
      id: 'chapter-1',
      bookId: 'book-1',
      title: 'First',
      order: 1,
      blocks: [
        {
          id: 'block-1',
          chapterId: 'chapter-1',
          order: 1,
          content: 'hello',
        },
        {
          id: 'block-2',
          chapterId: 'chapter-1',
          order: 2,
          content: 'world',
        },
      ],
    },
    {
      id: 'chapter-2',
      bookId: 'book-1',
      title: 'Second',
      order: 2,
      blocks: [],
    },
  ],
};

export const defineAudienceGraph = () => {
  const Book = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
  });
  const BookCollaborator = entity('BookCollaborator', {
    bookId: field.id(),
    userId: field.id(),
  });
  const Profile = entity('Profile', {
    id: field.id(),
    email: field.string(),
    displayName: field.string(),
  });

  const BookCollaboratorWithProfile = BookCollaborator.belongsTo('profile', Profile);
  const BookWithCollaborators = Book.hasMany('collaborators', BookCollaboratorWithProfile);

  mapEntity(BookWithCollaborators).toTable('books');
  mapEntity(BookCollaboratorWithProfile).toTable('book_collaborators', {
    bookId: 'book_id',
    userId: 'user_id',
  });
  mapEntity(Profile).toTable('profiles', {
    displayName: 'display_name',
  });

  mapRelation(BookWithCollaborators, 'collaborators', {
    type: 'one-to-many',
    from: 'books.id',
    to: 'book_collaborators.book_id',
  });
  mapRelation(BookCollaboratorWithProfile, 'profile', {
    type: 'many-to-one',
    from: 'book_collaborators.user_id',
    to: 'profiles.id',
  });

  return {
    Book,
    BookCollaborator,
    Profile,
    BookCollaboratorWithProfile,
    BookWithCollaborators,
  };
};

export const audienceDataset = {
  Book: [{ id: 'book-1', slug: 'progbook', title: 'Progbook' }],
  BookCollaborator: [
    { bookId: 'book-1', userId: 'user-2' },
    { bookId: 'book-1', userId: 'user-3' },
  ],
  Profile: [
    { id: 'user-2', email: 'ada@example.com', displayName: 'Ada' },
    { id: 'user-3', email: 'linus@example.com', displayName: 'Linus' },
  ],
};

export const expectedAudienceResult = {
  id: 'book-1',
  slug: 'progbook',
  title: 'Progbook',
  collaborators: [
    {
      bookId: 'book-1',
      userId: 'user-2',
      profile: {
        id: 'user-2',
        email: 'ada@example.com',
        displayName: 'Ada',
      },
    },
    {
      bookId: 'book-1',
      userId: 'user-3',
      profile: {
        id: 'user-3',
        email: 'linus@example.com',
        displayName: 'Linus',
      },
    },
  ],
};
