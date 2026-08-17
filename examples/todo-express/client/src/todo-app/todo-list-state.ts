export const canDeleteTodoList = ({
  hasSelectedList,
  isLoading,
  visibleTodoCount,
}: {
  hasSelectedList: boolean;
  isLoading: boolean;
  visibleTodoCount: number;
}) => hasSelectedList && !isLoading && visibleTodoCount === 0;
