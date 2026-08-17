import { useDurableOperation, useGraphQuery, useOperation } from '@ontahi/react/graph';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { Tag, TodoItem, TodoList } from '../../../src/generated/client-entities.js';
import {
  tagsQuery,
  todoItemsQuery,
  todoListsQuery,
  todoTagAssignmentsQuery,
} from '../todo-queries.js';

type AuthenticationSession = {
  mode: 'disabled' | 'github';
  authenticated: boolean;
  principal?: {
    subject: string;
    kind: 'user' | 'service';
    issuer?: string;
  };
  profile?: {
    username?: string;
    displayName?: string;
  };
};

export type TodoStatusFilter = 'all' | 'open' | 'completed';

const tagColors = ['#d95d4f', '#708b62', '#527d8c', '#a77b45'] as const;

export const useTodoApp = () => {
  const [title, setTitle] = useState('');
  const [listName, setListName] = useState('');
  const [tagName, setTagName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<TodoStatusFilter>('all');
  const [storage, setStorage] = useState<'in-memory' | 'postgres'>();
  const [authentication, setAuthentication] = useState<AuthenticationSession>();
  const lists = useGraphQuery(todoListsQuery, {
    mode: 'run',
    queryKey: ['TodoList', 'all'],
  });
  const tags = useGraphQuery(tagsQuery, {
    mode: 'run',
    queryKey: ['Tag', 'all'],
  });
  const assignments = useGraphQuery(todoTagAssignmentsQuery, {
    mode: 'run',
    queryKey: ['TodoTag', 'all'],
  });
  const todoSelection = useMemo(() => {
    const inSelectedList = TodoItem.selection(todo =>
      todo.list.eq(TodoList.refById(selectedListId)),
    );
    return statusFilter === 'all'
      ? inSelectedList
      : inSelectedList.and(todo => todo.completed.eq(statusFilter === 'completed'));
  }, [selectedListId, statusFilter]);
  const visibleTodosQuery = useMemo(() => todoItemsQuery(todoSelection), [todoSelection]);
  const todos = useGraphQuery(visibleTodosQuery, {
    mode: 'run',
    queryKey: ['TodoItem', 'selection', todoSelection.toJSON()],
    enabled: Boolean(selectedListId),
  });
  const createList = useOperation(TodoList.domain.create);
  const renameList = useOperation(TodoList.domain.rename);
  const deleteList = useOperation(TodoList.domain.delete);
  const createTag = useOperation(Tag.domain.create);
  const createTodo = useOperation(TodoItem.domain.create);
  const completeTodos = useOperation(TodoItem.domain.complete);
  const assignTags = useOperation(TodoItem.domain.assignTags);
  const removeTags = useOperation(TodoItem.domain.removeTags);
  const deleteAll = useOperation(TodoItem.domain.deleteAll);
  const completeAll = useDurableOperation(TodoItem.domain.completeAll);

  useEffect(() => {
    void fetch('/runtime')
      .then(response => response.json() as Promise<{ storage: 'in-memory' | 'postgres' }>)
      .then(runtime => setStorage(runtime.storage));
  }, []);

  useEffect(() => {
    void fetch('/auth/session')
      .then(response => response.json() as Promise<AuthenticationSession>)
      .then(setAuthentication);
  }, []);

  useEffect(() => {
    if (!selectedListId && lists.data?.[0]) setSelectedListId(lists.data[0].id);
  }, [lists.data, selectedListId]);

  useEffect(() => {
    if (!selectedTagId && tags.data?.[0]) setSelectedTagId(tags.data[0].id);
  }, [selectedTagId, tags.data]);

  const submitTodo = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || !selectedListId) return;

    const result = await createTodo.executeAsync({
      id: globalThis.crypto.randomUUID(),
      list: TodoList.refById(selectedListId),
      title: normalizedTitle,
    });
    if (result.ok) setTitle('');
  };

  const submitList = async (event: FormEvent) => {
    event.preventDefault();
    const name = listName.trim();
    if (!name) return;
    const id = globalThis.crypto.randomUUID();
    const result = await createList.executeAsync({ id, name });
    if (result.ok) {
      setListName('');
      setSelectedListId(id);
      setSelectedIds([]);
    }
  };

  const submitTag = async (event: FormEvent) => {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    const id = globalThis.crypto.randomUUID();
    const result = await createTag.executeAsync({
      id,
      name,
      color: tagColors[(tags.data?.length ?? 0) % tagColors.length]!,
    });
    if (result.ok) {
      setTagName('');
      setSelectedTagId(id);
    }
  };

  const renameSelectedList = async () => {
    const currentList = lists.data?.find(list => list.id === selectedListId);
    if (!currentList) return;
    const name = globalThis.prompt('List name', currentList.name)?.trim();
    if (!name || name === currentList.name) return;
    await renameList.executeAsync({ list: TodoList.refById(selectedListId), name });
  };

  const deleteSelectedList = async () => {
    if (!selectedListId || !globalThis.confirm('Delete this empty list?')) return;
    const result = await deleteList.executeAsync({ list: TodoList.refById(selectedListId) });
    if (result.ok) {
      setSelectedListId('');
      setSelectedIds([]);
    }
  };

  const completeSelected = async () => {
    await completeTodos.executeAsync({ todos: selectedIds });
    setSelectedIds([]);
  };

  const completeVisible = async () => {
    await completeTodos.executeAsync({ todos: todoSelection });
    setSelectedIds([]);
  };

  const changeSelectedTags = async (mode: 'assign' | 'remove') => {
    if (!selectedTagId || selectedIds.length === 0) return;
    const operation = mode === 'assign' ? assignTags : removeTags;
    await operation.executeAsync({ todos: selectedIds, tagIds: [selectedTagId] });
  };

  const signOut = async () => {
    const response = await fetch('/auth/logout', { method: 'POST' });
    if (!response.ok) return;

    setAuthentication(current =>
      current
        ? {
            authenticated: false,
            mode: current.mode,
          }
        : current,
    );
  };

  const visibleTodos = todos.data ?? [];
  const canComplete = authentication?.mode === 'disabled' || authentication?.authenticated === true;
  const tagById = new Map(tags.data?.map(tag => [tag.id, tag]) ?? []);
  const tagIdsByTodo = new Map<string, string[]>();
  assignments.data?.forEach(assignment => {
    tagIdsByTodo.set(assignment.todoId, [
      ...(tagIdsByTodo.get(assignment.todoId) ?? []),
      assignment.tagId,
    ]);
  });

  return {
    header: {
      storage,
      authentication,
      signOut,
    },
    organizer: {
      lists: lists.data ?? [],
      tags: tags.data ?? [],
      selectedListId,
      selectedTagId,
      listName,
      tagName,
      isCreatingList: createList.isExecuting,
      isRenamingList: renameList.isExecuting,
      isDeletingList: deleteList.isExecuting,
      isCreatingTag: createTag.isExecuting,
      hasVisibleTodos: visibleTodos.length > 0,
      changeListName: setListName,
      changeTagName: setTagName,
      selectList: (id: string) => {
        setSelectedListId(id);
        setSelectedIds([]);
      },
      selectTag: setSelectedTagId,
      submitList,
      submitTag,
      renameSelectedList,
      deleteSelectedList,
    },
    todoPanel: {
      title,
      statusFilter,
      hasLists: Boolean(lists.data?.length),
      hasSelectedList: Boolean(selectedListId),
      isCreatingTodo: createTodo.isExecuting,
      isLoading: todos.isLoading,
      isError: todos.isError,
      changeTitle: setTitle,
      submitTodo,
      selectStatus: (status: TodoStatusFilter) => {
        setStatusFilter(status);
        setSelectedIds([]);
      },
      items: visibleTodos.map(todo => ({
        ...todo,
        tags: (tagIdsByTodo.get(todo.id) ?? []).flatMap(tagId => {
          const tag = tagById.get(tagId);
          return tag ? [tag] : [];
        }),
      })),
      selectedIds,
      selectTodo: (id: string, selected: boolean) => {
        setSelectedIds(current =>
          selected ? [...current, id] : current.filter(selectedId => selectedId !== id),
        );
      },
      actions: {
        canComplete,
        hasSelectedTodos: selectedIds.length > 0,
        hasVisibleTodos: visibleTodos.length > 0,
        hasSelectedTag: Boolean(selectedTagId),
        isCompleting: completeTodos.isExecuting,
        isAssigningTags: assignTags.isExecuting,
        isRemovingTags: removeTags.isExecuting,
        isDeletingAll: deleteAll.isExecuting,
        completeSelected,
        completeVisible,
        assignTag: () => changeSelectedTags('assign'),
        removeTag: () => changeSelectedTags('remove'),
        completeAll: () => completeAll.execute(),
        deleteAll: () => deleteAll.execute(),
      },
      durableRun: {
        value: completeAll.value,
        isQueued: completeAll.isQueued,
        isRunning: completeAll.isRunning,
        isCompleted: completeAll.isCompleted,
        isFailed: completeAll.isFailed,
        isCancelled: completeAll.isCancelled,
        isExecuting: completeAll.isExecuting,
        progress: completeAll.progress,
        finalValue: completeAll.finalValue,
        error: completeAll.runError,
      },
    },
  };
};

export type TodoAppModel = ReturnType<typeof useTodoApp>;
