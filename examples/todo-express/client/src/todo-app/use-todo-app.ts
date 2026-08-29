import { createEntityRef, relationshipSet, Selection } from '@ontahi/core/data-graph';
import { useGraphQuery, useManyToManyRelationshipCommand, useOperation } from '@ontahi/react/graph';
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
  Tag,
  TagSchema,
  TodoItem,
  TodoItemSchema,
  TodoList,
} from '../../../src/generated/client-entities.js';
import { allTodoItemsQuery, tagsQuery, todoListsQuery } from '../todo-queries.js';

import { loadTodoRuntime } from './bootstrap.js';
import type { AuthenticationSession, BootstrapState, TodoRuntime } from './bootstrap.js';
import { canDeleteTodoList, groupTodoLists } from './todo-list-state.js';

const tagColors = ['#dd6658', '#6f8d72', '#527d8c', '#a77b45', '#8a6ab1'] as const;

type TodoTagMutation = { todoId: string; tagId: string };

const createTodoTagCommand = (action: 'add' | 'remove', { todoId, tagId }: TodoTagMutation) => {
  const todos = Selection.references(TodoItemSchema, [
    createEntityRef(TodoItemSchema, { id: todoId }),
  ]);
  const tag = createEntityRef(TagSchema, { id: tagId });
  const relation = relationshipSet(TodoItemSchema, 'tags', todos);
  return action === 'add' ? relation.add(tag) : relation.remove(tag);
};

const thrownMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const operationMessage = (result: { ok: boolean; message?: string }, fallback: string) =>
  result.ok ? undefined : result.message || fallback;

const todoFailureReason = (result: { kind: string; failure?: unknown }) =>
  result.kind === 'failed' &&
  typeof result.failure === 'object' &&
  result.failure !== null &&
  'reason' in result.failure &&
  typeof result.failure.reason === 'string'
    ? result.failure.reason
    : undefined;

export type UseTodoAppOptions = {
  authentication: BootstrapState<AuthenticationSession>;
  setAuthentication: Dispatch<SetStateAction<BootstrapState<AuthenticationSession>>>;
};

export const useTodoApp = ({ authentication, setAuthentication }: UseTodoAppOptions) => {
  const [runtime, setRuntime] = useState<BootstrapState<TodoRuntime>>({ status: 'loading' });
  const [actionError, setActionError] = useState<string>();
  const [creatingTodoFor, setCreatingTodoFor] = useState<string>();
  const [renamingListId, setRenamingListId] = useState<string>();
  const [deletingListId, setDeletingListId] = useState<string>();
  const [completingTodoId, setCompletingTodoId] = useState<string>();
  const [taggingTodoId, setTaggingTodoId] = useState<string>();

  const lists = useGraphQuery(todoListsQuery);
  const tags = useGraphQuery(tagsQuery);
  const todos = useGraphQuery(allTodoItemsQuery);
  const createListOperation = useOperation(TodoList.domain.create);
  const renameListOperation = useOperation(TodoList.domain.rename);
  const deleteListOperation = useOperation(TodoList.domain.delete);
  const createTagOperation = useOperation(Tag.domain.create);
  const createTodoOperation = useOperation(TodoItem.domain.create);
  const completeTodoOperation = useOperation(TodoItem.domain.complete);
  const linkTags = useManyToManyRelationshipCommand(
    (input: TodoTagMutation) => createTodoTagCommand('add', input),
    { onSuccess: () => todos.refetch() },
  );
  const unlinkTags = useManyToManyRelationshipCommand(
    (input: TodoTagMutation) => createTodoTagCommand('remove', input),
    { onSuccess: () => todos.refetch() },
  );

  useEffect(() => {
    void loadTodoRuntime().then(setRuntime);
  }, []);

  const dashboardLists = useMemo(
    () => groupTodoLists(lists.data ?? [], todos.data ?? [], todo => todo.list.locator.id),
    [lists.data, todos.data],
  );

  const createList = async (rawName: string) => {
    const name = rawName.trim();
    if (!name) return false;

    setActionError(undefined);
    try {
      const result = await createListOperation.executeAsync({
        id: globalThis.crypto.randomUUID(),
        name,
      });
      const message = operationMessage(result, 'The list could not be created.');
      setActionError(message);
      return !message;
    } catch (error) {
      setActionError(thrownMessage(error, 'The list could not be created.'));
      return false;
    }
  };

  const renameList = async (listId: string, rawName: string) => {
    const name = rawName.trim();
    if (!name) return false;

    const validation = TodoList.domain.rename.input.safeParse({ list: listId, name });
    if (!validation.success) {
      setActionError(validation.issues[0]?.message ?? 'The list name is not valid.');
      return false;
    }

    setActionError(undefined);
    setRenamingListId(listId);
    try {
      const result = await renameListOperation.executeAsync({
        list: TodoList.refById(listId),
        name,
      });
      const message = operationMessage(result, 'The list could not be renamed.');
      setActionError(message);
      return !message;
    } catch (error) {
      setActionError(thrownMessage(error, 'The list could not be renamed.'));
      return false;
    } finally {
      setRenamingListId(undefined);
    }
  };

  const deleteList = async (listId: string) => {
    setActionError(undefined);
    setDeletingListId(listId);
    try {
      const result = await deleteListOperation.executeAsync({ list: TodoList.refById(listId) });
      const message = operationMessage(result, 'The list could not be deleted.');
      setActionError(message);
      return !message;
    } catch (error) {
      setActionError(thrownMessage(error, 'The list could not be deleted.'));
      return false;
    } finally {
      setDeletingListId(undefined);
    }
  };

  const createTodo = async (listId: string, rawTitle: string) => {
    const title = rawTitle.trim();
    if (!title) return false;

    setActionError(undefined);
    setCreatingTodoFor(listId);
    try {
      const result = await createTodoOperation.executeAsync({
        id: globalThis.crypto.randomUUID(),
        list: TodoList.refById(listId),
        title,
      });
      if (result.ok) return true;

      if (todoFailureReason(result) === 'todo_list_not_found') {
        await Promise.all([lists.refetch(), todos.refetch()]);
        setActionError('That list no longer exists. The board has been refreshed.');
        return false;
      }

      setActionError(result.message || 'The todo could not be added.');
      return false;
    } catch (error) {
      setActionError(thrownMessage(error, 'The todo could not be added.'));
      return false;
    } finally {
      setCreatingTodoFor(undefined);
    }
  };

  const completeTodo = async (todoId: string) => {
    setActionError(undefined);
    setCompletingTodoId(todoId);
    try {
      const result = await completeTodoOperation.executeAsync({ todos: [todoId] });
      const message = operationMessage(result, 'The todo could not be completed.');
      setActionError(message);
      return !message;
    } catch (error) {
      setActionError(thrownMessage(error, 'The todo could not be completed.'));
      return false;
    } finally {
      setCompletingTodoId(undefined);
    }
  };

  const toggleTodoTag = async (todoId: string, tagId: string, isAssigned: boolean) => {
    setActionError(undefined);
    setTaggingTodoId(todoId);
    try {
      const command = isAssigned ? unlinkTags : linkTags;
      await command.mutateAsync({ todoId, tagId });
      return true;
    } catch (error) {
      setActionError(thrownMessage(error, 'The tag could not be changed.'));
      return false;
    } finally {
      setTaggingTodoId(undefined);
    }
  };

  const createTagForTodo = async (todoId: string, rawName: string) => {
    const name = rawName.trim();
    if (!name) return false;

    setActionError(undefined);
    setTaggingTodoId(todoId);
    try {
      const tagId = globalThis.crypto.randomUUID();
      const result = await createTagOperation.executeAsync({
        id: tagId,
        name,
        color: tagColors[(tags.data?.length ?? 0) % tagColors.length]!,
      });
      const message = operationMessage(result, 'The tag could not be created.');
      if (message) {
        setActionError(message);
        return false;
      }

      await linkTags.mutateAsync({ todoId, tagId });
      return true;
    } catch (error) {
      setActionError(thrownMessage(error, 'The tag could not be created.'));
      return false;
    } finally {
      setTaggingTodoId(undefined);
    }
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
    dashboard: {
      lists: dashboardLists.map(list => ({
        ...list,
        canDelete: canDeleteTodoList({ isLoading: todos.isLoading, itemCount: list.items.length }),
      })),
      tags: tags.data ?? [],
      isLoading: lists.isLoading || todos.isLoading,
      isError: lists.isError || todos.isError || tags.isError,
      actionError,
      canComplete,
      isCreatingList: createListOperation.isExecuting,
      creatingTodoFor,
      renamingListId,
      deletingListId,
      completingTodoId,
      taggingTodoId,
      clearActionError: () => setActionError(undefined),
      createList,
      renameList,
      deleteList,
      createTodo,
      completeTodo,
      toggleTodoTag,
      createTagForTodo,
    },
  };
};

export type TodoAppModel = ReturnType<typeof useTodoApp>;
