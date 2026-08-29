export const canDeleteTodoList = ({
  isLoading,
  itemCount,
}: {
  isLoading: boolean;
  itemCount: number;
}) => !isLoading && itemCount === 0;

type Identified = { id: unknown };

export const groupTodoLists = <List extends Identified, Todo>(
  lists: readonly List[],
  todos: readonly Todo[],
  listIdForTodo: (todo: Todo) => unknown,
) =>
  lists.map(list => ({
    ...list,
    items: todos.filter(todo => listIdForTodo(todo) === list.id),
  }));

export const reconcileTodoListOrder = (
  currentIds: readonly string[],
  availableIds: readonly string[],
) => {
  const available = new Set(availableIds);
  const current = new Set(currentIds);
  return [
    ...currentIds.filter(id => available.has(id)),
    ...availableIds.filter(id => !current.has(id)),
  ];
};

export const moveTodoList = (
  currentIds: readonly string[],
  movingId: string,
  beforeId?: string,
) => {
  if (!currentIds.includes(movingId) || movingId === beforeId) return [...currentIds];

  const nextIds = currentIds.filter(id => id !== movingId);
  const targetIndex = beforeId ? nextIds.indexOf(beforeId) : -1;
  nextIds.splice(targetIndex < 0 ? nextIds.length : targetIndex, 0, movingId);
  return nextIds;
};
