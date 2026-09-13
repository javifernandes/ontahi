import {
  entity,
  field,
  mapEntity,
  mapRelation,
  Selection,
  withContextualSelections,
} from '@ontahi/core/data-graph';

export const contextualModel = () => {
  const NodeBase = entity('ContextNode', {
    id: field.id(),
    bookId: field.string(),
    parentId: field.nullable(field.string()),
    type: field.string(),
  });
  const Node = withContextualSelections(
    NodeBase.hasMany('children', NodeBase, { via: 'parentId' }),
    ({ self }) => ({ chapters: self.children.where(n => n.type.eq('chapter')) }),
  );
  const Tag = entity('ContextTag', { id: field.id() });
  const Book = withContextualSelections(
    entity('ContextBook', {
      id: field.id(),
      slug: field.string(),
      visible: field.boolean(),
    })
      .hasMany('nodes', Node, { via: 'bookId' })
      .manyToMany('tags', Tag),
    ({ self }) => ({ parts: self.nodes.where(n => n.type.eq('part')) }),
  );
  const Nodes = Node.belongsTo('book', Book, { via: 'bookId' });
  mapEntity(Book).toTable('books');
  mapEntity(Node).toTable('nodes', { bookId: 'book_id', parentId: 'parent_id', type: 'node_type' });
  mapEntity(Tag).toTable('tags');
  mapRelation(Book, 'tags', {
    type: 'many-to-many',
    from: 'books.id',
    to: 'tags.id',
    through: { table: 'book_tags', fromColumn: 'book_id', toColumn: 'tag_id' },
  });
  return {
    Book,
    Node: Nodes,
    Tag,
    entities: [Book, Nodes, Tag],
    chapters: Selection.where(Book, b => b.slug.eq('book-one')).parts.chapters,
  };
};
