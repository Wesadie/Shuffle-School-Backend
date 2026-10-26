import type { ClassConfig, Student } from "@shared/schema";

const previousSchoolOf = (student: Student) => {
  const entry = Object.entries(student.characteristics || {}).find(([name]) => name.trim().toLowerCase() === "previous school");
  if (!entry) return "";
  const value = Array.isArray(entry[1]) ? entry[1][0] : entry[1];
  return typeof value === "string" ? value.trim() : "";
};

export const getPreviousSchoolDistribution = (students: Student[]): Record<string, number> => {
  const distribution: Record<string, number> = {};
  students.forEach((student) => {
    const school = previousSchoolOf(student);
    if (school) distribution[school] = (distribution[school] || 0) + 1;
  });
  return distribution;
};

const getPreviousSchoolCohortCounts = (cohort: Student[]) => {
  const counts = new Map<string, number>();
  cohort.forEach((student) => {
    const school = previousSchoolOf(student);
    if (school) counts.set(school, (counts.get(school) || 0) + 1);
  });
  return counts;
};

export const calculatePreviousSchoolClassBalanceScore = (
  classStudents: Student[],
  classConfig: ClassConfig,
  classConfigs: ClassConfig[],
  targetClassSizes: Map<string, number>,
  cohort: Student[],
): number => {
  const cohortCounts = getPreviousSchoolCohortCounts(cohort);
  const targetSizeTotal = classConfigs.reduce((sum, config) => sum + (targetClassSizes.get(config.id) || 0), 0);
  const classTargetSize = targetClassSizes.get(classConfig.id) || 0;
  if (cohortCounts.size === 0 || targetSizeTotal === 0 || classTargetSize === 0) return 100;

  const classCounts = getPreviousSchoolDistribution(classStudents);
  const targetShare = classTargetSize / targetSizeTotal;
  let deviation = 0;
  cohortCounts.forEach((count, school) => {
    deviation += Math.abs((classCounts[school] || 0) - count * targetShare);
  });
  const expectedTotal = Array.from(cohortCounts.values()).reduce((sum, count) => sum + count * targetShare, 0);
  return Math.max(0, 100 - (deviation / (2 * Math.max(expectedTotal, 1))) * 100);
};

export const calculatePreviousSchoolBalanceScore = (
  studentsByClass: Map<string, Student[]>,
  classConfigs: ClassConfig[],
  targetClassSizes: Map<string, number>,
  cohort: Student[],
): number => {
  if (classConfigs.length === 0) return 100;
  const classScores = classConfigs.map((config) =>
    calculatePreviousSchoolClassBalanceScore(
      studentsByClass.get(config.id) || [],
      config,
      classConfigs,
      targetClassSizes,
      cohort,
    ),
  );
  return classScores.reduce((sum, score) => sum + score, 0) / classScores.length;
};
