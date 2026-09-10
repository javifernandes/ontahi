import { entity, field, mapEntity, mapRelation, modelExpression } from '@ontahi/core/data-graph';

import { postgresMapping } from './index.js';

export const TodoEntity = entity('Todo', {
  id: field.id(),
  title: field.string(),
  completed: field.boolean(),
});

export const TodoMapping = postgresMapping({
  entity: TodoEntity,
  table: 'todos',
  columns: {
    id: 'todo_id',
    title: 'todo_title',
    completed: 'is_completed',
  },
});

const availableSeatsExpression = modelExpression.define(
  modelExpression.subtract(
    modelExpression.field('capacity'),
    modelExpression.relation('students').count(),
  ),
);
const DerivedCourseBase = entity('DerivedCourse', {
  id: field.id(),
  capacity: field.nonNegativeInteger(),
  availableSeats: field.derived(field.nonNegativeInteger(), availableSeatsExpression),
});
export const DerivedStudent = entity('DerivedStudent', {
  id: field.id(),
  course: field.ref(DerivedCourseBase),
});
export const DerivedCourse = DerivedCourseBase.hasMany('students', DerivedStudent, {
  via: 'course',
});
mapEntity(DerivedCourse).toTable('derived_courses');
mapEntity(DerivedStudent).toTable('derived_students', { course: 'course_id' });
mapRelation(DerivedCourse, 'students', {
  type: 'one-to-many',
  from: 'derived_courses.id',
  to: 'derived_students.course_id',
});
export const DerivedCourseMapping = postgresMapping({
  entity: DerivedCourse,
  table: 'derived_courses',
  columns: { id: 'id', capacity: 'capacity' },
});
export const DerivedCourseCapacity = DerivedCourse.view('DerivedCourseCapacity', {
  id: true,
  availableSeats: true,
});

export {
  defineConformanceGraph,
  conformanceGraph,
  conformanceDataset,
} from '../../../sql/src/data-graph/fixtures.test-support.js';
