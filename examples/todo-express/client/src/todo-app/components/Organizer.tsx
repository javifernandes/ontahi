import type { TodoAppModel } from '../use-todo-app.js';

export const Organizer = ({
  lists,
  tags,
  selectedListId,
  selectedTagId,
  listName,
  tagName,
  isCreatingList,
  isRenamingList,
  isDeletingList,
  isCreatingTag,
  hasVisibleTodos,
  changeListName,
  changeTagName,
  selectList,
  selectTag,
  submitList,
  submitTag,
  renameSelectedList,
  deleteSelectedList,
}: TodoAppModel['organizer']) => (
  <aside className='organizer'>
    <div>
      <span className='section-label'>Lists</span>
      <nav className='list-nav' aria-label='Todo lists'>
        {lists.map(list => (
          <button
            key={list.id}
            className={list.id === selectedListId ? 'active' : ''}
            onClick={() => selectList(list.id)}
          >
            {list.name}
          </button>
        ))}
      </nav>
      <form className='compact-form' onSubmit={submitList}>
        <input
          aria-label='List name'
          value={listName}
          onChange={event => changeListName(event.target.value)}
          placeholder='New list'
        />
        <button disabled={isCreatingList}>+</button>
      </form>
      <div className='list-actions'>
        <button
          className='ghost'
          disabled={!selectedListId || isRenamingList}
          onClick={renameSelectedList}
        >
          Rename
        </button>
        <button
          className='danger'
          disabled={!selectedListId || hasVisibleTodos || isDeletingList}
          onClick={deleteSelectedList}
          title={hasVisibleTodos ? 'Delete the todos in this list first.' : undefined}
        >
          Delete
        </button>
      </div>
    </div>

    <div>
      <span className='section-label'>Tags</span>
      <div className='tag-picker'>
        {tags.map(tag => (
          <button
            key={tag.id}
            className={tag.id === selectedTagId ? 'active' : ''}
            onClick={() => selectTag(tag.id)}
          >
            <i style={{ background: tag.color }} />
            {tag.name}
          </button>
        ))}
      </div>
      <form className='compact-form' onSubmit={submitTag}>
        <input
          aria-label='Tag name'
          value={tagName}
          onChange={event => changeTagName(event.target.value)}
          placeholder='New tag'
        />
        <button disabled={isCreatingTag}>+</button>
      </form>
    </div>
  </aside>
);
