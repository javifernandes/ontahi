import {
  entity,
  field,
  mapRelation,
  Selection,
  withContextualSelections,
} from '@ontahi/core/data-graph';

import { sqlMapping } from './mapping.js';

export const contextualGraph = () => {
  const NodeBase = entity('ImageNode', {
    id: field.id(),
    bookId: field.nullable(field.string()),
    parentId: field.nullable(field.string()),
    type: field.string(),
  });
  const Node = withContextualSelections(
    NodeBase.hasMany('children', NodeBase, { via: 'parentId' }),
    ({ self }) => ({ chapters: self.children.where(n => n.type.eq('chapter')) }),
  );
  const BookBase = entity('ImageBook', { id: field.id(), visible: field.boolean() });
  const Tag = entity('ImageTag', { id: field.id(), name: field.string() });
  const Book = withContextualSelections(
    BookBase.hasMany('nodes', Node, { via: 'bookId' }).manyToMany('tags', Tag),
    ({ self }) => ({ parts: self.nodes.where(n => n.type.eq('part')) }),
  );
  const Nodes = Node.belongsTo('book', Book, { via: 'bookId' });
  mapRelation(Book, 'tags', {
    type: 'many-to-many',
    from: 'image_books.book_id',
    to: 'image_tags.tag_id',
    through: { table: 'image_book_tags', fromColumn: 'book_id', toColumn: 'tag_id' },
  });
  const mappings = [
    sqlMapping({
      entity: Book,
      table: 'image_books',
      columns: { id: 'book_id', visible: 'is_visible' },
    }),
    sqlMapping({
      entity: Node,
      table: 'image_nodes',
      columns: { id: 'node_id', bookId: 'book_id', parentId: 'parent_id', type: 'node_type' },
    }),
    sqlMapping({
      entity: Tag,
      table: 'image_tags',
      columns: { id: 'tag_id', name: 'tag_name' },
    }),
  ];
  const dataset = {
    ImageBook: [
      { id: 'b1', visible: true },
      { id: 'b2', visible: false },
    ],
    ImageNode: [
      { id: 'p1', bookId: 'b1', parentId: null, type: 'part' },
      { id: 'p2', bookId: 'b2', parentId: null, type: 'part' },
      { id: 'c1', bookId: 'b1', parentId: 'p1', type: 'chapter' },
      { id: 'c2', bookId: 'b1', parentId: 'p1', type: 'chapter' },
      { id: 'c3', bookId: 'b2', parentId: 'p2', type: 'chapter' },
      { id: 'root', bookId: 'b1', parentId: null, type: 'chapter' },
      { id: 'orphan', bookId: null, parentId: null, type: 'chapter' },
    ],
    ImageTag: [
      { id: 't1', name: 'shared' },
      { id: 't2', name: 'private' },
    ],
  };
  const chapters = Selection.where(Book, b => b.visible.eq(true)).parts.chapters;
  return { Book, Node: Nodes, Tag, mappings, dataset, chapters };
};
