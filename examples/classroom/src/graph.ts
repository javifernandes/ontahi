import { defineGraphApi } from '@ontahi/core/data-graph';

import { Course, Enrollment, School, Student, Teacher } from './classroom.js';

export const ClassroomGraphApi = defineGraphApi({
  entities: { School, Teacher, Course, Student, Enrollment },
});
