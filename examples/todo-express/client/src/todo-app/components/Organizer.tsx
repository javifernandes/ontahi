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
  canDeleteList,
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
            type='button'
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
        <button type='submit' disabled={isCreatingList}>
          +
        </button>
      </form>
      <div className='list-actions'>
        <button
          type='button'
          className='ghost'
          disabled={!selectedListId || isRenamingList}
          onClick={renameSelectedList}
        >
          Rename
        </button>
        <button
          type='button'
          className='danger'
          disabled={!canDeleteList || isDeletingList}
          onClick={deleteSelectedList}
          title={
            selectedListId && !canDeleteList
              ? 'Wait until the list is known to be empty.'
              : undefined
          }
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
            type='button'
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
        <button type='submit' disabled={isCreatingTag}>
          +
        </button>
      </form>
    </div>
  </aside>
);
