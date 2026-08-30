type Identified = { id: unknown };

export const deleteTodoListWithItems = async ({
  itemIds,
  deleteItem,
  deleteList,
}: {
  itemIds: readonly string[];
  deleteItem: (itemId: string) => Promise<boolean>;
  deleteList: () => Promise<boolean>;
}) => {
  for (const itemId of itemIds) {
    if (!(await deleteItem(itemId))) return false;
  }
  return deleteList();
};

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

export const reconcileTodoItemOrder = (
  currentIds: readonly string[],
  availableIds: readonly string[],
) => reconcileTodoListOrder(currentIds, availableIds);

export const moveTodoItem = (currentIds: readonly string[], movingId: string, beforeId?: string) =>
  moveTodoList(currentIds, movingId, beforeId);

export type DeskCardPosition = {
  x: number;
  y: number;
  z: number;
};

export type DeskLayout = Record<string, DeskCardPosition>;

const deskCardWidth = 360;
const deskCardGap = 22;

export const defaultDeskCardPosition = (index: number, canvasWidth: number): DeskCardPosition => {
  const columns = Math.max(
    1,
    Math.floor((canvasWidth + deskCardGap) / (deskCardWidth + deskCardGap)),
  );
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: column * (deskCardWidth + deskCardGap) + (row % 2) * 9,
    y: row * 330 + (column % 2) * 14,
    z: index + 1,
  };
};

export const reconcileDeskLayout = (
  current: DeskLayout,
  orderedIds: readonly string[],
  canvasWidth: number,
): DeskLayout => {
  const available = new Set(orderedIds);
  const next = Object.fromEntries(
    Object.entries(current).filter(
      ([id, position]) =>
        available.has(id) &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        Number.isFinite(position.z),
    ),
  );

  orderedIds.forEach((id, index) => {
    next[id] ??= defaultDeskCardPosition(index, canvasWidth);
  });

  return next;
};

export const bringDeskCardToFront = (layout: DeskLayout, id: string): DeskLayout => {
  const current = layout[id];
  if (!current) return layout;

  return {
    ...layout,
    [id]: {
      ...current,
      z: Math.max(0, ...Object.values(layout).map(position => position.z)) + 1,
    },
  };
};
