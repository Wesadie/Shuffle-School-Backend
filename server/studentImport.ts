export interface StudentIdRow {
  studentId?: string | null;
}

export interface StudentImportPartition<T extends StudentIdRow> {
  rowsToImport: T[];
  skippedExisting: number;
  duplicateRows: number;
  existingDuplicateStudentIds: string[];
}

const normalizeStudentId = (studentId?: string | null) => (studentId ?? "").trim().toLowerCase();

export const partitionStudentImportRows = <T extends StudentIdRow>(
  uploadedRows: T[],
  existingRows: StudentIdRow[],
): StudentImportPartition<T> => {
  const existingCounts = new Map<string, number>();
  existingRows.forEach((row) => {
    const id = normalizeStudentId(row.studentId);
    if (id) existingCounts.set(id, (existingCounts.get(id) || 0) + 1);
  });

  const uploadedIds = new Set<string>();
  const existingDuplicateStudentIds = new Set<string>();
  const rowsToImport: T[] = [];
  let skippedExisting = 0;
  let duplicateRows = 0;
  existingCounts.forEach((count, id) => {
    if (count > 1) existingDuplicateStudentIds.add(id);
  });

  uploadedRows.forEach((row) => {
    const id = normalizeStudentId(row.studentId);
    if (!id) {
      rowsToImport.push(row);
      return;
    }
    if (uploadedIds.has(id)) {
      duplicateRows += 1;
      return;
    }
    uploadedIds.add(id);
    if (existingCounts.has(id)) {
      skippedExisting += 1;
      return;
    }
    rowsToImport.push(row);
  });

  return {
    rowsToImport,
    skippedExisting,
    duplicateRows,
    existingDuplicateStudentIds: Array.from(existingDuplicateStudentIds),
  };
};
