import { defineGraphApi } from '@ontahi/core/data-graph';

import { Todo } from './todo.js';

export const TodoGraphApi = defineGraphApi({
  entities: { Todo },
});
