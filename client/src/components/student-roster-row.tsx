import { memo, useRef, useState } from 'react';
import { Edit2, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { TableRow, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RosterMultiSelectCell } from '@/components/roster-multi-select-cell';
import { toast } from '@/hooks/use-toast';
import { getStudentDisplayId, getNewGrade, getRawCharacteristicValue, getCharacteristicValue, getRequestsTotal, uniqueOptions } from '@/lib/student-roster-display';
import { isCharacteristicApplicableToGrade } from '@shared/characteristics';
import { characteristicImportError } from '@shared/learner-import';
import { applyStudentPatch } from '@shared/student-roster';
import type { Student, InsertStudent, Characteristic, CharacteristicResponse } from '@shared/schema';

interface StudentRosterRowProps {
  student: Student;
  selected: boolean;
  characteristicColumns: Characteristic[];
  responseLookup: Map<string, Map<string, CharacteristicResponse>>;
  gradeOptions: string[];
  genderOptions: string[];
  currentClassOptions: string[];
  newGradeOptions: string[];
  onSelect: (id: string) => void;
  onEdit: (student: Student) => void;
  onDelete: (id: string) => void;
  onSave: (student: Student, patch: Partial<InsertStudent>) => Promise<void>;
}

export const StudentRosterRow = memo(function StudentRosterRow({ student: storedStudent, selected, characteristicColumns, responseLookup, gradeOptions, genderOptions, currentClassOptions, newGradeOptions, onSelect, onEdit, onDelete, onSave }: StudentRosterRowProps) {
  const [editingCell, setEditingCell] = useState<{ studentId: string; key: string } | null>(null);
  const [inlineDraft, setInlineDraft] = useState('');
  const [localPatch, setLocalPatch] = useState<Partial<InsertStudent>>({});
  const student = applyStudentPatch(storedStudent, localPatch);
  const pending = useRef(new Set<string>());
  const cancelled = useRef(false);
  const [savingCellKeys, setSavingCellKeys] = useState<Set<string>>(new Set());
  const cellKey = (student: Student, key: string) => `${student.id}:${key}`;

  const startTextEdit = (student: Student, key: string, value: string) => {
    if (savingCellKeys.has(cellKey(student, key))) return;
    cancelled.current = false;
    setEditingCell({ studentId: student.id, key });
    setInlineDraft(value === "—" ? "" : value);
  };

  const saveInlineUpdate = async (student: Student, key: string, data: Partial<InsertStudent>) => {
    const keyForCell = cellKey(student, key);
    if (pending.current.has(keyForCell)) return;
    pending.current.add(keyForCell);
    setSavingCellKeys(new Set(pending.current));
    setLocalPatch((current) => ({ ...current, ...data,
      ...(data.characteristics ? { characteristics: { ...current.characteristics, ...data.characteristics } } : {}),
    }));
    try { await onSave(storedStudent, data); }
    catch { /* The shared save handler restores the previous fields and reports the error. */ }
    finally {
      pending.current.delete(keyForCell);
      setSavingCellKeys(new Set(pending.current));
      setLocalPatch((current) => {
        const next: Record<string, unknown> = { ...current };
        for (const key of Object.keys(data)) {
          if (key === 'characteristics') {
            const values = { ...current.characteristics };
            for (const name of Object.keys(data.characteristics || {})) delete values[name];
            if (Object.keys(values).length) next.characteristics = values; else delete next.characteristics;
          } else delete next[key];
        }
        return next as Partial<InsertStudent>;
      });
    }
  };

  const commitTextEdit = async (
    student: Student,
    key: string,
    previousValue: string,
    nextValue: string,
    buildData: (value: string) => Partial<InsertStudent>,
    required = false,
  ) => {
    if (cancelled.current) return;
    const trimmedValue = nextValue.trim();
    setEditingCell(null);

    if (required && !trimmedValue) {
      setInlineDraft(previousValue);
      return;
    }

    if (trimmedValue === previousValue) return;
    const data = buildData(trimmedValue);
    const characteristic = characteristicColumns.find((c) => key === 'characteristic:' + c.name + ':' + c.type);
    const invalid = characteristic ? characteristicImportError(trimmedValue, characteristic.type) : null;
    if (invalid) { toast({ title: characteristic!.name + ' ' + invalid, variant: 'destructive' }); return; }
    await saveInlineUpdate(student, key, data);
  };

  const cancelTextEdit = () => {
    cancelled.current = true;
    setEditingCell(null);
    setInlineDraft("");
  };

  const updateCharacteristicData = (name: string, value: string | string[]): Partial<InsertStudent> => ({
    characteristics: {
      [name]: value,
    },
  });

  const updateStudentIdData = (student: Student, value: string): Partial<InsertStudent> => {
    if (student.studentId) return { studentId: value || null };
    return updateCharacteristicData("studentId", value);
  };

  const renderTextCell = (
    student: Student,
    key: string,
    value: string,
    buildData: (value: string) => Partial<InsertStudent>,
    required = false,
    className = "whitespace-nowrap",
    inputType: "text" | "number" = "text",
  ) => {
    const keyForCell = cellKey(student, key);
    const isEditing = editingCell?.studentId === student.id && editingCell.key === key;
    const isSaving = savingCellKeys.has(keyForCell);

    if (isEditing) {
      return (
        <Input
          autoFocus
          type={inputType}
          min={inputType === "number" ? 0 : undefined}
          max={inputType === "number" && key.includes("percentage") ? 100 : undefined}
          value={inlineDraft}
          disabled={isSaving}
          onChange={(event) => setInlineDraft(event.target.value)}
          onBlur={() => commitTextEdit(student, key, value === "—" ? "" : value, inlineDraft, buildData, required)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancelTextEdit();
            }
          }}
          className={`h-8 px-2 ${key === "firstName" || key === "lastName" ? "min-w-0 flex-1" : "min-w-28"}`}
        />
      );
    }

    return (
      <button
        type="button"
        disabled={isSaving}
        onClick={() => startTextEdit(student, key, value)}
        className={`block w-full rounded-sm text-left hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 ${className}`}
        title={key === "firstName" || key === "lastName" ? value : "Click to edit"}
      >
        {value}{isSaving && <span className="ml-2 text-xs text-muted-foreground">Saving…</span>}
      </button>
    );
  };

  const renderSelectCell = (
    student: Student,
    key: string,
    value: string,
    options: string[],
    buildData: (value: string | null) => Partial<InsertStudent>,
    responses?: Map<string, CharacteristicResponse>,
  ) => {
    const keyForCell = cellKey(student, key);
    const isSaving = savingCellKeys.has(keyForCell);
    const displayValue = value === "—" ? "" : value;
    const allOptions = uniqueOptions([displayValue, ...options]);
    const selectedResponse = responses?.get(displayValue);

    return (
      <Select
        value={displayValue || "__empty__"}
        disabled={isSaving || allOptions.length === 0}
        onValueChange={(nextValue) => {
          const normalizedValue = nextValue === "__empty__" ? null : nextValue;
          const nextDisplayValue = normalizedValue ?? "";
          if (nextDisplayValue !== displayValue) {
            void saveInlineUpdate(student, key, buildData(normalizedValue));
          }
        }}
      >
        <SelectTrigger
          className="h-8 min-w-28 justify-between border-0 bg-transparent px-0 text-left shadow-none hover:bg-muted/60 focus:ring-1"
          title="Select value"
        >
          {displayValue ? (
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {selectedResponse && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedResponse.color }}
                />
              )}
              <span className="truncate">{displayValue}{isSaving && <span className="ml-2 text-xs text-muted-foreground">Saving…</span>}</span>
            </span>
          ) : (
            <SelectValue placeholder={isSaving ? "Saving…" : "Select…"} />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty__">Select…</SelectItem>
          {allOptions.map((option) => {
            const response = responses?.get(option);
            return (
              <SelectItem key={option} value={option}>
                <span className="flex items-center gap-2">
                  {response && (
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: response.color }}
                    />
                  )}
                  {option}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  };

  const renderMultiSelectCell = (
    student: Student, key: string, value: string | string[] | undefined, options: string[],
    buildData: (value: string[]) => Partial<InsertStudent>, responses?: Map<string, CharacteristicResponse>,
  ) => <RosterMultiSelectCell value={value} options={options} responses={responses} saving={savingCellKeys.has(cellKey(student, key))} onSave={(next) => void saveInlineUpdate(student, key, buildData(next))} />;


  return (
                    <TableRow key={student.id} data-testid={`row-student-${student.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => onSelect(student.id)}
                          data-testid={`checkbox-student-${student.id}`}
                        />
                      </TableCell>
                      <TableCell className="sticky left-0 z-10 w-36 min-w-[144px] max-w-[144px] bg-background p-2 font-medium whitespace-nowrap shadow-[inset_-1px_0_0_hsl(var(--border))] sm:w-44 sm:min-w-[176px] sm:max-w-[176px]">
                        <div className="flex w-32 min-w-0 items-center gap-1 sm:w-40">
                          {renderTextCell(
                            student,
                            "firstName",
                            student.firstName,
                            (value) => ({ firstName: value }),
                            true,
                            "min-w-0 flex-1 truncate",
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 p-0"
                            disabled={savingCellKeys.size > 0}
                            onClick={() => onEdit(student)}
                            aria-label="Edit student"
                            title="Edit student"
                            data-testid={`button-edit-student-inline-${student.id}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="sticky left-36 z-10 w-36 min-w-[144px] max-w-[144px] bg-background p-2 font-medium whitespace-nowrap shadow-[inset_-1px_0_0_hsl(var(--border))] sm:left-44 sm:w-44 sm:min-w-[176px] sm:max-w-[176px]">
                        <div className="flex w-32 min-w-0 items-center gap-2 sm:w-40">
                          {renderTextCell(
                            student,
                            "lastName",
                            student.lastName,
                            (value) => ({ lastName: value }),
                            true,
                            "min-w-0 flex-1 truncate",
                          )}
                          {student.parentRequests && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" data-testid={`icon-parent-request-${student.id}`} />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">Parent request on file</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {renderTextCell(
                          student,
                          "studentId",
                          getStudentDisplayId(student),
                          (value) => updateStudentIdData(student, value),
                        )}
                      </TableCell>
                      <TableCell>
                        {renderSelectCell(
                          student,
                          "gender",
                          student.gender || "—",
                          genderOptions,
                          (value) => ({ gender: value ?? "" }),
                        )}

                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {renderSelectCell(
                          student,
                          "grade",
                          student.grade,
                          gradeOptions,
                          (value) => ({ grade: value ?? student.grade }),
                        )}

                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {currentClassOptions.length > 0
                          ? renderSelectCell(
                              student,
                              "currentClass",
                              student.currentClass || "—",
                              currentClassOptions,
                              (value) => ({ currentClass: value }),
                            )
                          : renderTextCell(
                              student,
                              "currentClass",
                              student.currentClass || "—",
                              (value) => ({ currentClass: value }),
                            )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {renderSelectCell(
                          student,
                          "newGrade",
                          getNewGrade(student),
                          newGradeOptions,
                          (value) => updateCharacteristicData("newGrade", value ?? ""),
                        )}

                      </TableCell>
                      <TableCell className="min-w-48 max-w-72" title={student.notes || ""}>
                        {renderTextCell(
                          student,
                          "notes",
                          student.notes || "—",
                          (value) => ({ notes: value }),
                          false,
                          "truncate",
                        )}
                      </TableCell>
                      <TableCell>{getRequestsTotal(student)}</TableCell>
                      {characteristicColumns.map((char) => {
                        const responses = responseLookup.get(char.name);
                        const options = responses ? Array.from(responses.keys()) : char.options || [];
                        const isNumeric = char.type === "scale" || char.type === "percentage";
                        const isApplicable = isCharacteristicApplicableToGrade(char, student.grade);
                        const rawValue = getRawCharacteristicValue(student, char.name);
                        return (
                          <TableCell key={char.id} className="whitespace-nowrap">
                            {!isApplicable
                              ? <span className="text-muted-foreground">—</span>
                              : char.type === "category" && options.length > 0 && char.multiSelect
                                ? renderMultiSelectCell(
                                    student,
                                    `characteristic:${char.name}`,
                                    rawValue,
                                    options,
                                    (value) => updateCharacteristicData(char.name, value ?? ""),

                                    responses,
                                  )
                                : char.type === "category" && options.length > 0
                                  ? renderSelectCell(
                                      student,
                                      `characteristic:${char.name}`,
                                      getCharacteristicValue(student, char.name),
                                      options,
                                      (value) => updateCharacteristicData(char.name, value ?? ""),
                                      responses,
                                    )

                                  : renderTextCell(
                                      student,
                                      `characteristic:${char.name}:${char.type}`,
                                      getCharacteristicValue(student, char.name),
                                      (value) => updateCharacteristicData(char.name, value),
                                      false,
                                      "whitespace-nowrap",
                                      isNumeric ? "number" : "text",
                                    )}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={savingCellKeys.size > 0}
                            onClick={() => onEdit(student)}
                            data-testid={`button-edit-student-${student.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={savingCellKeys.size > 0}
                            onClick={() => onDelete(student.id)}
                            data-testid={`button-delete-student-${student.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
  );
});
