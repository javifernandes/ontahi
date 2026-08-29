import { layer } from '@ontahi/core/runtime/server';

import { ClassroomApplication } from './application.js';

const classroomScenarios = layer('examples.classroom', {
  concerns: [ClassroomApplication.app.graph.withRuntime()],
});
const classroom = ClassroomApplication.graph.entities;

export type ReassignStudentInput = {
  studentId: string;
  previousCourseId: string;
  nextCourseId: string;
  onMismatch?: 'skip';
};

export const reassignStudent = classroomScenarios.effect(
  'reassignStudent',
  ({ studentId, previousCourseId, nextCourseId, onMismatch }: ReassignStudentInput) =>
    classroom.Student.refById(studentId)
      .currentCourse.assign(classroom.Course.refById(nextCourseId), {
        ifCurrent: classroom.Course.refById(previousCourseId),
        ...(onMismatch ? { onMismatch } : {}),
      })
      .run(),
);

export type RemoveStudentFromCourseInput = {
  courseId: string;
  studentId: string;
};

export const removeStudentFromCourse = classroomScenarios.effect(
  'removeStudentFromCourse',
  ({ courseId, studentId }: RemoveStudentFromCourseInput) =>
    classroom.Course.refById(courseId).students.remove(classroom.Student.refById(studentId)).run(),
);

export const addStudentToCourse = classroomScenarios.effect(
  'addStudentToCourse',
  ({ courseId, studentId }: RemoveStudentFromCourseInput) =>
    classroom.Course.refById(courseId).students.add(classroom.Student.refById(studentId)).run(),
);
