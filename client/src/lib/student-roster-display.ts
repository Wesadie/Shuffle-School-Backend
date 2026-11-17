import { formatCharacteristicValue } from "@shared/characteristics";
import { getNextGrade } from "@shared/grades";
import type { Student } from "@shared/schema";

export const getCharacteristics = (student: Student) => student.characteristics || {};
export const getStudentDisplayId = (student: Student) => student.studentId || formatCharacteristicValue(getCharacteristics(student).studentId) || "—";
export const getNewGrade = (student: Student) => formatCharacteristicValue(getCharacteristics(student).newGrade) || getNextGrade(student.grade) || "—";
export const getRawCharacteristicValue = (student: Student, name: string) => getCharacteristics(student)[name];
export const getCharacteristicValue = (student: Student, name: string) => formatCharacteristicValue(getRawCharacteristicValue(student, name)) || "—";
export const getRequestsTotal = (student: Student) => [student.parentRequests, student.parentNotes].filter((value) => value && value.trim()).length;
export const uniqueOptions = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
