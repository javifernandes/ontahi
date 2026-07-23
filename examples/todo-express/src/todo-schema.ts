import { entity, field } from '@ontahi/core/data-graph';

export const TodoEntity = entity('Todo', {
  id: field.id(),
  title: field.nonEmptyString({ trim: true }),
  completed: field.boolean(),
})
  .locators({ refById: 'id' })
  .identity('refById');
