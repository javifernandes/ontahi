import { defineGraphApi } from '@ontahi/core';

import { Course, Enrollment, School, Student, Teacher } from './classroom.js';

export const ClassroomGraphApi = defineGraphApi({
  entities: { School, Teacher, Course, Student, Enrollment },
});
