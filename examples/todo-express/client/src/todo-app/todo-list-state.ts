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
