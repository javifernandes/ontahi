import { createEntityRef, relationshipSet, Selection } from '@ontahi/core/data-graph';
import {
  useGraphExecutorCapability,
  useGraphQuery,
  useManyToManyRelationshipCommand,
  useOperation,
} from '@ontahi/react/graph';
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
import { groupTodoLists } from './todo-list-state.js';
import { renameTodoItem } from './todo-mutations.js';

const tagColors = ['#dd6658', '#6f8d72', '#527d8c', '#a77b45', '#8a6ab1'] as const;

export const listPastelColors = [
  '#f5ddd5',
  '#f4e5b8',
  '#dcebdc',
  '#dbe8f4',
  '#e8dcf2',
  '#f2dce6',
] as const;

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
  const [recoloringListId, setRecoloringListId] = useState<string>();
  const [deletingListId, setDeletingListId] = useState<string>();
  const [completingTodoId, setCompletingTodoId] = useState<string>();
  const [renamingTodoId, setRenamingTodoId] = useState<string>();
  const [deletingTodoId, setDeletingTodoId] = useState<string>();
  const [taggingTodoId, setTaggingTodoId] = useState<string>();
  const [deletingTagId, setDeletingTagId] = useState<string>();

  const lists = useGraphQuery(todoListsQuery);
  const tags = useGraphQuery(tagsQuery);
  const todos = useGraphQuery(allTodoItemsQuery);
  const graphExecutor = useGraphExecutorCapability();
  const createListOperation = useOperation(TodoList.domain.create);
  const renameListOperation = useOperation(TodoList.domain.rename);
  const recolorListOperation = useOperation(TodoList.domain.recolor);
  const deleteListOperation = useOperation(TodoItem.domain.deleteList);
  const deleteTagOperation = useOperation(TodoItem.domain.deleteTag);
  const createTodoOperation = useOperation(TodoItem.domain.create);
  const setTodoCompletedOperation = useOperation(TodoItem.domain.setCompleted);
  const deleteTodoOperation = useOperation(TodoItem.domain.delete);
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
    if (!name) return undefined;

    setActionError(undefined);
    try {
      const listId = globalThis.crypto.randomUUID();
      const result = await createListOperation.executeAsync({
        id: listId,
        name,
        color: listPastelColors[(lists.data?.length ?? 0) % listPastelColors.length]!,
      });
      const message = operationMessage(result, 'The list could not be created.');
      setActionError(message);
      return message ? undefined : listId;
    } catch (error) {
      setActionError(thrownMessage(error, 'The list could not be created.'));
      return undefined;
    }
  };

  const recolorList = async (listId: string, color: string) => {
    setActionError(undefined);
    setRecoloringListId(listId);
    try {
      const result = await recolorListOperation.executeAsync({
        list: TodoList.refById(listId),
        color,
      });
      const message = operationMessage(result, 'The list color could not be changed.');
      setActionError(message);
      return !message;
    } catch (error) {
      setActionError(thrownMessage(error, 'The list color could not be changed.'));
      return false;
    } finally {
      setRecoloringListId(undefined);
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

  const setTodoCompleted = async (todoId: string, completed: boolean) => {
    setActionError(undefined);
    setCompletingTodoId(todoId);
    try {
      const result = await setTodoCompletedOperation.executeAsync({ todos: [todoId], completed });
      const message = operationMessage(result, 'The todo completion could not be changed.');
      setActionError(message);
      return !message;
    } catch (error) {
      setActionError(thrownMessage(error, 'The todo completion could not be changed.'));
      return false;
    } finally {
      setCompletingTodoId(undefined);
    }
  };

  const renameTodo = async (todoId: string, rawTitle: string) => {
    setActionError(undefined);
    setRenamingTodoId(todoId);
    try {
      const result = await renameTodoItem(graphExecutor, todos.refetch, todoId, rawTitle);
      setActionError(result.ok ? undefined : result.message);
      return result.ok;
    } finally {
      setRenamingTodoId(undefined);
    }
  };

  const deleteTodo = async (todoId: string) => {
    setActionError(undefined);
    setDeletingTodoId(todoId);
    try {
      const result = await deleteTodoOperation.executeAsync({ todo: TodoItem.refById(todoId) });
      const message = operationMessage(result, 'The todo could not be deleted.');
      setActionError(message);
      return !message;
    } catch (error) {
      setActionError(thrownMessage(error, 'The todo could not be deleted.'));
      return false;
    } finally {
      setDeletingTodoId(undefined);
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
      if (!graphExecutor?.runEntityMutationCommand) {
        setActionError('This runtime cannot create tags.');
        return false;
      }
      await graphExecutor.runEntityMutationCommand(
        Tag.create({
          id: tagId,
          name,
          color: tagColors[(tags.data?.length ?? 0) % tagColors.length]!,
        }),
      );
      await tags.refetch();

      await linkTags.mutateAsync({ todoId, tagId });
      return true;
    } catch (error) {
      setActionError(thrownMessage(error, 'The tag could not be created.'));
      return false;
    } finally {
      setTaggingTodoId(undefined);
    }
  };

  const deleteTag = async (tagId: string) => {
    setActionError(undefined);
    setDeletingTagId(tagId);
    try {
      const result = await deleteTagOperation.executeAsync({ tag: Tag.refById(tagId) });
      const message = operationMessage(result, 'The tag could not be deleted.');
      setActionError(message);
      return !message;
    } catch (error) {
      setActionError(thrownMessage(error, 'The tag could not be deleted.'));
      return false;
    } finally {
      setDeletingTagId(undefined);
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
      lists: dashboardLists,
      tags: tags.data ?? [],
      isLoading: lists.isLoading || todos.isLoading,
      isError: lists.isError || todos.isError || tags.isError,
      actionError,
      canComplete,
      isCreatingList: createListOperation.isExecuting,
      creatingTodoFor,
      renamingListId,
      recoloringListId,
      deletingListId,
      completingTodoId,
      renamingTodoId,
      deletingTodoId,
      taggingTodoId,
      deletingTagId,
      clearActionError: () => setActionError(undefined),
      createList,
      renameList,
      recolorList,
      deleteList,
      createTodo,
      setTodoCompleted,
      renameTodo,
      deleteTodo,
      toggleTodoTag,
      createTagForTodo,
      deleteTag,
    },
  };
};

export type TodoAppModel = ReturnType<typeof useTodoApp>;
