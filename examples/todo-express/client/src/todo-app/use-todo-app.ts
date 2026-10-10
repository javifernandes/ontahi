import {
  createEntityRef,
  mutateEntity,
  relationship,
  relationshipSet,
  Selection,
  type EntityMutationCommand,
  type OrderedRelationshipPosition,
} from '@ontahi/core/data-graph';
import {
  useEntityMutationCommand,
  useGraphQuery,
  useCanonicalRequestInvalidation,
  invalidateSemanticGraphReads,
  useManyToManyRelationshipCommand,
  useOrderedRelationshipCommand,
  useDurableOperation,
} from '@ontahi/react/graph';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
  Tag,
  TagSchema,
  TodoItem,
  TodoItemSchema,
  TodoList,
  TodoListSchema,
} from '../../../src/generated/client-entities.js';
import { tagsQuery, todoListsQuery } from '../todo-queries.js';

import { loadTodoRuntime } from './bootstrap.js';
import type { AuthenticationSession, BootstrapState, TodoRuntime } from './bootstrap.js';
import { moveTodoItem } from './todo-list-state.js';
import {
  createTodoItem,
  createTodoList,
  deleteTodoItem,
  deleteTodoList,
  deleteTodoTag,
  renameTodoItem,
  setTodoItemCompleted,
} from './todo-mutations.js';

const tagColors = ['#dd6658', '#6f8d72', '#527d8c', '#a77b45', '#8a6ab1'] as const;
const modelCommandOperations = [
  TodoList.domain.completeAll,
  TodoItem.domain.deleteFromNamedList,
] as const;

export const listPastelColors = [
  '#f5ddd5',
  '#f4e5b8',
  '#dcebdc',
  '#dbe8f4',
  '#e8dcf2',
  '#f2dce6',
] as const;

type TodoTagMutation = { todoId: string; tagId: string };
type TodoOrderMutation = {
  listId: string;
  todoId: string;
  beforeTodoId?: string;
  ifPosition: OrderedRelationshipPosition;
};

const createTodoTagCommand = (action: 'add' | 'remove', { todoId, tagId }: TodoTagMutation) => {
  const todos = Selection.references(TodoItemSchema, [
    createEntityRef(TodoItemSchema, { id: todoId }),
  ]);
  const tag = createEntityRef(TagSchema, { id: tagId });
  const relation = relationshipSet(TodoItemSchema, 'tags', todos);
  return action === 'add' ? relation.add(tag) : relation.remove(tag);
};

const createTodoOrderCommand = ({ listId, todoId, beforeTodoId, ifPosition }: TodoOrderMutation) =>
  relationship(TodoListSchema, 'items', createEntityRef(TodoListSchema, { id: listId })).move(
    createEntityRef(TodoItemSchema, { id: todoId }),
    beforeTodoId
      ? { before: createEntityRef(TodoItemSchema, { id: beforeTodoId }) }
      : { at: 'end' },
    { ifPosition, onMismatch: 'fail' },
  );

const thrownMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const operationMessage = (result: { ok: boolean; message?: string }, fallback: string) =>
  result.ok ? undefined : result.message || fallback;

export type UseTodoAppOptions = {
  authentication: BootstrapState<AuthenticationSession>;
  setAuthentication: Dispatch<SetStateAction<BootstrapState<AuthenticationSession>>>;
};

export const useTodoApp = ({ authentication, setAuthentication }: UseTodoAppOptions) => {
  const [runtime, setRuntime] = useState<BootstrapState<TodoRuntime>>({ status: 'loading' });
  const [actionError, setActionError] = useState<string>();
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [creatingTodoFor, setCreatingTodoFor] = useState<string>();
  const [renamingListId, setRenamingListId] = useState<string>();
  const [recoloringListId, setRecoloringListId] = useState<string>();
  const [deletingListId, setDeletingListId] = useState<string>();
  const [completingListId, setCompletingListId] = useState<string>();
  const [completingTodoId, setCompletingTodoId] = useState<string>();
  const [renamingTodoId, setRenamingTodoId] = useState<string>();
  const [deletingTodoId, setDeletingTodoId] = useState<string>();
  const [taggingTodoId, setTaggingTodoId] = useState<string>();
  const [deletingTagId, setDeletingTagId] = useState<string>();
  const [reorderingTodoId, setReorderingTodoId] = useState<string>();
  const [optimisticOrder, setOptimisticOrder] = useState<TodoOrderMutation>();

  const lists = useGraphQuery(todoListsQuery);
  const tags = useGraphQuery(tagsQuery);
  const queryClient = useQueryClient();
  const entityMutation = useEntityMutationCommand((command: EntityMutationCommand) => command);
  const executeEntityMutation = entityMutation.mutateAsync;
  const invalidateModelCommand = useCanonicalRequestInvalidation(modelCommandOperations);
  const completeAllOperation = useDurableOperation(TodoList.domain.completeAll);
  const reorderTodo = useOrderedRelationshipCommand(createTodoOrderCommand);
  const linkTags = useManyToManyRelationshipCommand((input: TodoTagMutation) =>
    createTodoTagCommand('add', input),
  );
  const unlinkTags = useManyToManyRelationshipCommand((input: TodoTagMutation) =>
    createTodoTagCommand('remove', input),
  );

  useEffect(() => {
    void loadTodoRuntime().then(setRuntime);
  }, []);

  const dashboardLists = useMemo(() => {
    const current = lists.data ?? [];
    if (!optimisticOrder) return current;
    return current.map(list => {
      if (list.id !== optimisticOrder.listId) return list;
      const ids = moveTodoItem(
        list.items.map(todo => todo.id),
        optimisticOrder.todoId,
        optimisticOrder.beforeTodoId,
      );
      return {
        ...list,
        items: ids.flatMap(id => {
          const todo = list.items.find(candidate => candidate.id === id);
          return todo ? [todo] : [];
        }),
      };
    });
  }, [lists.data, optimisticOrder]);

  const createList = async (rawName: string) => {
    setActionError(undefined);
    setIsCreatingList(true);
    try {
      const result = await createTodoList(
        executeEntityMutation,
        rawName,
        listPastelColors[(lists.data?.length ?? 0) % listPastelColors.length]!,
      );
      if (!result.ok) setActionError(result.message);
      return result.ok ? result.id : undefined;
    } finally {
      setIsCreatingList(false);
    }
  };

  const recolorList = async (listId: string, color: string) => {
    setActionError(undefined);
    setRecoloringListId(listId);
    try {
      await executeEntityMutation(
        mutateEntity(TodoListSchema).update(createEntityRef(TodoListSchema, { id: listId }), {
          color,
        }),
      );
      return true;
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

    setActionError(undefined);
    setRenamingListId(listId);
    try {
      await executeEntityMutation(
        mutateEntity(TodoListSchema).update(createEntityRef(TodoListSchema, { id: listId }), {
          name,
        }),
      );
      return true;
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
      const result = await deleteTodoList(executeEntityMutation, listId);
      setActionError(result.ok ? undefined : result.message);
      return result.ok;
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
      const result = await createTodoItem(executeEntityMutation, listId, title);
      setActionError(result.ok ? undefined : result.message);
      return result.ok;
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
      const result = await setTodoItemCompleted(executeEntityMutation, todoId, completed);
      setActionError(result.ok ? undefined : result.message);
      return result.ok;
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
      const result = await renameTodoItem(executeEntityMutation, todoId, rawTitle);
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
      const result = await deleteTodoItem(executeEntityMutation, todoId);
      setActionError(result.ok ? undefined : result.message);
      return result.ok;
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
      await executeEntityMutation(
        Tag.create({
          id: tagId,
          name,
          color: tagColors[(tags.data?.length ?? 0) % tagColors.length]!,
        }),
      );
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
      const result = await deleteTodoTag(executeEntityMutation, tagId);
      setActionError(result.ok ? undefined : result.message);
      return result.ok;
    } catch (error) {
      setActionError(thrownMessage(error, 'The tag could not be deleted.'));
      return false;
    } finally {
      setDeletingTagId(undefined);
    }
  };

  const completeAllTodos = async (listId: string) => {
    setActionError(undefined);
    setCompletingListId(listId);
    try {
      const result = await completeAllOperation.executeAsync({ list: TodoList.refById(listId) });
      const message = operationMessage(result, 'The durable operation could not be started.');
      setActionError(message);
      return !message;
    } catch (error) {
      setActionError(thrownMessage(error, 'The durable operation could not be started.'));
      return false;
    }
  };

  const moveTodo = async (listId: string, todoId: string, beforeTodoId?: string) => {
    const list = dashboardLists.find(candidate => candidate.id === listId);
    const currentIndex = list?.items.findIndex(todo => todo.id === todoId) ?? -1;
    if (!list || currentIndex < 0 || todoId === beforeTodoId) return false;
    const currentIds = list.items.map(todo => todo.id);
    const nextIds = moveTodoItem(currentIds, todoId, beforeTodoId);
    if (nextIds.every((id, index) => id === currentIds[index])) return true;

    const input: TodoOrderMutation = {
      listId,
      todoId,
      ...(beforeTodoId ? { beforeTodoId } : {}),
      ifPosition: {
        before:
          currentIndex < currentIds.length - 1
            ? createEntityRef(TodoItemSchema, { id: currentIds[currentIndex + 1]! })
            : null,
        after:
          currentIndex > 0
            ? createEntityRef(TodoItemSchema, { id: currentIds[currentIndex - 1]! })
            : null,
      },
    };
    setActionError(undefined);
    setOptimisticOrder(input);
    setReorderingTodoId(todoId);
    try {
      await reorderTodo.mutateAsync(input);
      return true;
    } catch (error) {
      setActionError(thrownMessage(error, 'The todo order could not be changed.'));
      return false;
    } finally {
      setOptimisticOrder(undefined);
      setReorderingTodoId(undefined);
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
    globalThis.location.reload();
  };

  const authenticationSession =
    authentication.status === 'ready' ? authentication.value : undefined;
  const canComplete =
    authenticationSession?.mode === 'disabled' || authenticationSession?.authenticated === true;

  return {
    commandChat: {
      enabled: runtime.status === 'ready' && runtime.value.commandChat === true,
      refresh: async (
        outcome: { request: Parameters<typeof invalidateModelCommand>[0] },
        committedMutations?: Parameters<typeof invalidateSemanticGraphReads>[1],
      ) =>
        committedMutations
          ? invalidateSemanticGraphReads(queryClient, committedMutations)
          : invalidateModelCommand(outcome.request),
    },
    header: {
      runtime,
      authentication,
      signOut,
    },
    dashboard: {
      lists: dashboardLists,
      tags: tags.data ?? [],
      isLoading: lists.isLoading,
      isError: lists.isError || tags.isError,
      actionError,
      canComplete,
      isCreatingList,
      creatingTodoFor,
      renamingListId,
      recoloringListId,
      deletingListId,
      completingListId,
      completingTodoId,
      renamingTodoId,
      deletingTodoId,
      taggingTodoId,
      deletingTagId,
      reorderingTodoId,
      clearActionError: () => setActionError(undefined),
      createList,
      renameList,
      recolorList,
      deleteList,
      completeAllTodos,
      completeAll: {
        isExecuting: completeAllOperation.isExecuting,
        isQueued: completeAllOperation.isQueued,
        isRunning: completeAllOperation.isRunning,
        isCompleted: completeAllOperation.isCompleted,
        progress: completeAllOperation.progress,
        finalValue: completeAllOperation.finalValue,
      },
      createTodo,
      setTodoCompleted,
      renameTodo,
      deleteTodo,
      toggleTodoTag,
      createTagForTodo,
      deleteTag,
      moveTodo,
    },
  };
};

export type TodoAppModel = ReturnType<typeof useTodoApp>;
