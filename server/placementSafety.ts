import type { ClassConfig, Placement, Rule, Student } from "@shared/schema";

export class PlacementRevisionConflictError extends Error {
  constructor() {
    super("Placements changed since they were loaded. Refresh and try again.");
    this.name = "PlacementRevisionConflictError";
  }
}

export class InvalidPlacementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlacementError";
  }
}

export class PlacementNotFoundError extends Error {
  constructor() {
    super("Placement not found");
    this.name = "PlacementNotFoundError";
  }
}

export async function runRevisionedMutation<T>(
  expectedRevision: number,
  advanceRevision: (expectedRevision: number) => Promise<number | null>,
  mutate: (nextRevision: number) => Promise<T>,
): Promise<T> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new InvalidPlacementError("A valid placement revision is required");
  }
  const nextRevision = await advanceRevision(expectedRevision);
  if (nextRevision === null) throw new PlacementRevisionConflictError();
  return mutate(nextRevision);
}

export function validatePlacements(
  candidatePlacements: Pick<Placement, "studentId" | "classId">[],
  students: Student[],
  classConfigs: ClassConfig[],
  rules: Rule[],
): void {
  const studentById = new Map(students.map((student) => [student.id, student]));
  const classById = new Map(classConfigs.map((config) => [config.id, config]));
  const classByStudent = new Map<string, string>();
  const classCounts = new Map<string, number>();

  for (const placement of candidatePlacements) {
    if (classByStudent.has(placement.studentId)) {
      throw new InvalidPlacementError("A learner can only be assigned once");
    }
    if (!studentById.has(placement.studentId) || !classById.has(placement.classId)) {
      throw new InvalidPlacementError("Placement references must belong to the current account");
    }
    classByStudent.set(placement.studentId, placement.classId);
    classCounts.set(placement.classId, (classCounts.get(placement.classId) ?? 0) + 1);
  }

  for (const [classId, count] of classCounts) {
    const config = classById.get(classId)!;
    const capacity = config.capacity || 30;
    if (count > capacity) {
      throw new InvalidPlacementError(`${config.name} exceeds capacity (${count}/${capacity})`);
    }
  }

  for (const rule of rules) {
    if (rule.importance === "important") continue;
    const class1 = classByStudent.get(rule.studentId1);
    const class2 = classByStudent.get(rule.studentId2);
    if (class1 && class2 && rule.type === "pair" && class1 !== class2) {
      throw new InvalidPlacementError("This placement would separate learners with a mandatory together request");
    }
    if (class1 && class2 && rule.type === "separate" && class1 === class2) {
      throw new InvalidPlacementError("This placement would place learners with a mandatory separation request together");
    }
  }
}

export function buildSwapPlacements(
  placements: Placement[],
  student1Id: string,
  class1Id: string,
  student2Id: string,
  class2Id: string,
): Placement[] {
  const placement1 = placements.find((placement) => placement.studentId === student1Id);
  const placement2 = placements.find((placement) => placement.studentId === student2Id);
  if (!placement1 || !placement2 || student1Id === student2Id) {
    throw new InvalidPlacementError("One or both learners are not currently placed");
  }
  return placements.map((placement) => {
    if (placement.id === placement1.id) return { ...placement, classId: class1Id };
    if (placement.id === placement2.id) return { ...placement, classId: class2Id };
    return placement;
  });
}
