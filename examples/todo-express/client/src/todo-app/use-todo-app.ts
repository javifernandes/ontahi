import { createEntityRef, relationshipSet, Selection } from '@ontahi/core/data-graph';
import {
  useDurableOperation,
  useGraphQuery,
  useManyToManyRelationshipCommand,
  useOperation,
} from '@ontahi/react/graph';
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';

import {
  Tag,
  TagSchema,
  TodoItem,
  TodoItemSchema,
  TodoList,
} from '../../../src/generated/client-entities.js';
import { tagsQuery, todoItemsQuery, todoListsQuery } from '../todo-queries.js';

import { loadTodoRuntime } from './bootstrap.js';
import type { AuthenticationSession, BootstrapState, TodoRuntime } from './bootstrap.js';
import { canDeleteTodoList } from './todo-list-state.js';

export type TodoStatusFilter = 'all' | 'open' | 'completed';

const tagColors = ['#d95d4f', '#708b62', '#527d8c', '#a77b45'] as const;

export type UseTodoAppOptions = {
  authentication: BootstrapState<AuthenticationSession>;
  setAuthentication: Dispatch<SetStateAction<BootstrapState<AuthenticationSession>>>;
};

export const useTodoApp = ({ authentication, setAuthentication }: UseTodoAppOptions) => {
  const [title, setTitle] = useState('');
  const [listName, setListName] = useState('');
  const [tagName, setTagName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<TodoStatusFilter>('all');
  const [runtime, setRuntime] = useState<BootstrapState<TodoRuntime>>({ status: 'loading' });
  const lists = useGraphQuery(todoListsQuery);
  const tags = useGraphQuery(tagsQuery);
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
    enabled: Boolean(selectedListId),
  });
  const createList = useOperation(TodoList.domain.create);
  const renameList = useOperation(TodoList.domain.rename);
  const deleteList = useOperation(TodoList.domain.delete);
  const createTag = useOperation(Tag.domain.create);
  const createTodo = useOperation(TodoItem.domain.create);
  const completeSelectedTodos = useOperation(TodoItem.domain.complete({ todos: selectedIds }));
  const completeVisibleTodos = useOperation(TodoItem.domain.complete({ todos: todoSelection }));
  const relationshipCommand = (action: 'add' | 'remove') =>
    useManyToManyRelationshipCommand(
      ({ todoIds, tagId }: { todoIds: string[]; tagId: string }) => {
        const todos = Selection.references(
          TodoItemSchema,
          todoIds.map(id => createEntityRef(TodoItemSchema, { id })),
        );
        const tag = createEntityRef(TagSchema, { id: tagId });
        const relation = relationshipSet(TodoItemSchema, 'tags', todos);
        return action === 'add' ? relation.add(tag) : relation.remove(tag);
      },
      { onSuccess: () => todos.refetch() },
    );
  const linkTags = relationshipCommand('add');
  const unlinkTags = relationshipCommand('remove');
  const deleteAll = useOperation(TodoItem.domain.deleteAll);
  const completeAll = useDurableOperation(TodoItem.domain.completeAll);

  useEffect(() => {
    void loadTodoRuntime().then(setRuntime);
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
    await completeSelectedTodos.executeAsync();
    setSelectedIds([]);
  };

  const completeVisible = async () => {
    await completeVisibleTodos.executeAsync();
    setSelectedIds([]);
  };

  const changeSelectedTags = async (mode: 'assign' | 'remove') => {
    if (!selectedTagId || selectedIds.length === 0) return;
    const command = mode === 'assign' ? linkTags : unlinkTags;
    await command.mutateAsync({ todoIds: selectedIds, tagId: selectedTagId });
  };

  const signOut = async () => {
    const response = await fetch('/auth/logout', { method: 'POST' });
    if (!response.ok) return;

    setAuthentication(current =>
      current.status === 'ready'
        ? {
            status: 'ready',
            value: {
              authenticated: false,
              mode: current.value.mode,
            },
          }
        : current,
    );
  };

  const visibleTodos = todos.data ?? [];
  const authenticationSession =
    authentication.status === 'ready' ? authentication.value : undefined;
  const canComplete =
    authenticationSession?.mode === 'disabled' || authenticationSession?.authenticated === true;
  return {
    header: {
      runtime,
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
      canDeleteList: canDeleteTodoList({
        hasSelectedList: Boolean(selectedListId),
        isLoading: todos.isLoading,
        visibleTodoCount: visibleTodos.length,
      }),
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
      items: visibleTodos,
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
        isCompleting: completeSelectedTodos.isExecuting || completeVisibleTodos.isExecuting,
        isAssigningTags: linkTags.isPending,
        isRemovingTags: unlinkTags.isPending,
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
