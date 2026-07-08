import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Search, Users, ChevronUp, ChevronDown, MessageSquare, Upload, Download } from "lucide-react";
import { CSVImportDialog } from "@/components/csv-import-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { normalizeResponses } from "@shared/characteristics";
import type { Student, InsertStudent, Characteristic, ClassConfig, CharacteristicResponse } from "@shared/schema";

type SortField = "firstName" | "lastName" | "grade" | "currentClass";
type SortDirection = "asc" | "desc";
type EditingCell = { studentId: string; key: string } | null;

export default function StudentsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [showImportView, setShowImportView] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [sortField, setSortField] = useState<SortField>("lastName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [inlineDraft, setInlineDraft] = useState("");
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<InsertStudent>>({
    firstName: "",
    lastName: "",
    grade: "",
    currentClass: "",
    gender: "",
    notes: "",
    characteristics: {},
    parentRequests: "",
    parentNotes: "",
  });

  const { data: students = [], isLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const { data: characteristics = [] } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
  });

  const { data: classConfigs = [] } = useQuery<ClassConfig[]>({
    queryKey: ["/api/class-configs"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertStudent) => apiRequest("POST", "/api/students", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "Student added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add student", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertStudent> }) =>
      apiRequest("PATCH", `/api/students/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      setEditingStudent(null);
      resetForm();
      toast({ title: "Student updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update student", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/students/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Student deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete student", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/students/bulk-delete", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      setSelectedStudents(new Set());
      toast({ title: "Students deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete students", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      firstName: "",
      lastName: "",
      grade: "",
      currentClass: "",
      gender: "",
      notes: "",
      characteristics: {},
      parentRequests: "",
      parentNotes: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.firstName || !formData.lastName || !formData.grade) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }

    if (editingStudent) {
      updateMutation.mutate({ id: editingStudent.id, data: formData as InsertStudent });
    } else {
      createMutation.mutate(formData as InsertStudent);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const staticGrades = ["1", "2", "3", "4", "5", "6", "7"];
  const metadataCharacteristicNames = new Set(["studentId", "newGrade"]);
  const tableCharacteristicColumns = characteristics.filter(
    (char) => !metadataCharacteristicNames.has(char.name),
  );
  const formCharacteristicColumns = tableCharacteristicColumns;

  const responseLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, CharacteristicResponse>>();
    characteristics.forEach((char) => {
      if (char.type !== "category") return;
      lookup.set(char.name, new Map(normalizeResponses(char).map((response) => [response.name, response])));
    });
    return lookup;
  }, [characteristics]);

  const getCharacteristics = (student: Student): Record<string, string> =>
    (student.characteristics || {}) as Record<string, string>;

  const formatGrade = (grade?: string | null) => {
    if (!grade) return "—";
    return grade.toLowerCase().startsWith("grade ") ? grade : `Grade ${grade}`;
  };

  const normalizeGrade = (grade?: string | null) =>
    (grade || "").replace(/^grade\s+/i, "").trim();

  const getStudentDisplayId = (student: Student) =>
    student.studentId || getCharacteristics(student).studentId || "—";

  const getNewGrade = (student: Student) =>
    getCharacteristics(student).newGrade || "—";

  const getCharacteristicValue = (student: Student, name: string) =>
    getCharacteristics(student)[name] || "—";

  const getRequestsTotal = (student: Student) =>
    [student.parentRequests, student.parentNotes].filter((value) => value && value.trim()).length;

  const uniqueOptions = (values: Array<string | null | undefined>) =>
    Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));

  const gradeOptions = uniqueOptions([
    ...students.map((student) => student.grade),
    ...classConfigs.map((config) => config.grade),
    ...staticGrades,
  ]);

  const currentClassOptions = uniqueOptions([
    ...students.map((student) => student.currentClass),
    ...classConfigs.map((config) => config.name),
  ]);

  const newGradeOptions = uniqueOptions([
    ...students.map((student) => getCharacteristics(student).newGrade),
    ...classConfigs.map((config) => config.grade),
    ...staticGrades,
  ]);

  const genderOptions = uniqueOptions([
    ...students.map((student) => student.gender),
    "male",
    "female",
    "other",
  ]);

  const cellKey = (student: Student, key: string) => `${student.id}:${key}`;

  const startTextEdit = (student: Student, key: string, value: string) => {
    if (savingCellKey === cellKey(student, key)) return;
    setEditingCell({ studentId: student.id, key });
    setInlineDraft(value === "—" ? "" : value);
  };

  const saveInlineUpdate = async (student: Student, key: string, data: Partial<InsertStudent>) => {
    const keyForCell = cellKey(student, key);
    if (savingCellKey === keyForCell) return;

    setSavingCellKey(keyForCell);
    try {
      await apiRequest("PATCH", `/api/students/${student.id}`, data);
      await queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Student updated successfully" });
    } catch (error) {
      toast({ title: "Failed to update student", variant: "destructive" });
    } finally {
      setSavingCellKey(null);
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
    const trimmedValue = nextValue.trim();
    setEditingCell(null);

    if (required && !trimmedValue) {
      setInlineDraft(previousValue);
      return;
    }

    if (trimmedValue === previousValue) return;
    await saveInlineUpdate(student, key, buildData(trimmedValue));
  };

  const cancelTextEdit = () => {
    setEditingCell(null);
    setInlineDraft("");
  };

  const updateCharacteristicData = (student: Student, name: string, value: string): Partial<InsertStudent> => ({
    characteristics: {
      ...getCharacteristics(student),
      [name]: value,
    },
  });

  const updateStudentIdData = (student: Student, value: string): Partial<InsertStudent> => {
    if (student.studentId) return { studentId: value || null };
    return updateCharacteristicData(student, "studentId", value);
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
    const isSaving = savingCellKey === keyForCell;

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
          className="h-8 min-w-28 px-2"
        />
      );
    }

    return (
      <button
        type="button"
        disabled={isSaving}
        onClick={() => startTextEdit(student, key, value)}
        className={`block w-full rounded-sm text-left hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 ${className}`}
        title="Click to edit"
      >
        {isSaving ? "Saving…" : value}
      </button>
    );
  };

  const renderSelectCell = (
    student: Student,
    key: string,
    value: string,
    options: string[],
    buildData: (value: string) => Partial<InsertStudent>,
    responses?: Map<string, CharacteristicResponse>,
  ) => {
    const keyForCell = cellKey(student, key);
    const isSaving = savingCellKey === keyForCell;
    const displayValue = value === "—" ? "" : value;
    const allOptions = uniqueOptions([displayValue, ...options]);
    const selectedResponse = responses?.get(displayValue);

    return (
      <Select
        value={displayValue || undefined}
        disabled={isSaving || allOptions.length === 0}
        onValueChange={(nextValue) => {
          if (nextValue !== displayValue) {
            void saveInlineUpdate(student, key, buildData(nextValue));
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
              <span className="truncate">{isSaving ? "Saving…" : displayValue}</span>
            </span>
          ) : (
            <SelectValue placeholder={isSaving ? "Saving…" : "—"} />
          )}
        </SelectTrigger>
        <SelectContent>
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

  const findDuplicates = (studentList: Student[]) => {
    const nameCount = new Map<string, number>();
    studentList.forEach((s) => {
      const key = `${s.firstName.toLowerCase()}-${s.lastName.toLowerCase()}`;
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    });
    return studentList.filter((s) => {
      const key = `${s.firstName.toLowerCase()}-${s.lastName.toLowerCase()}`;
      return (nameCount.get(key) || 0) > 1;
    });
  };

  const filteredStudents = students
    .filter((student) => {
      const studentDisplayId = getStudentDisplayId(student);
      const matchesSearch =
        student.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        studentDisplayId.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesFilter = true;
      if (selectedGrade === "all") {
        matchesFilter = true;
      } else if (selectedGrade === "new") {
        matchesFilter = student.isNew === true;
      } else if (selectedGrade === "unallocated") {
        matchesFilter = !student.currentClass;
      } else if (selectedGrade === "no-id") {
        matchesFilter = getStudentDisplayId(student) === "—";
      } else if (selectedGrade === "leaving") {
        matchesFilter = student.isLeaving === true;
      } else if (selectedGrade === "duplicates") {
        const duplicates = findDuplicates(students);
        matchesFilter = duplicates.some((d) => d.id === student.id);
      } else {
        matchesFilter = normalizeGrade(student.grade) === selectedGrade;
      }
      
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const aValue = a[sortField] || "";
      const bValue = b[sortField] || "";
      const comparison = aValue.localeCompare(bValue);
      return sortDirection === "asc" ? comparison : -comparison;
    });

  const toggleSelectAll = () => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map((s) => s.id)));
    }
  };

  const toggleSelectStudent = (id: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedStudents(newSelected);
  };

  const openEditDialog = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      firstName: student.firstName,
      lastName: student.lastName,
      grade: student.grade,
      currentClass: student.currentClass || "",
      gender: student.gender || "",
      notes: student.notes || "",
      characteristics: student.characteristics || {},
      parentRequests: student.parentRequests || "",
      parentNotes: student.parentNotes || "",
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-3 w-3 ml-1 inline" />
    ) : (
      <ChevronDown className="h-3 w-3 ml-1 inline" />
    );
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "firstName",
      "lastName",
      "grade",
      "currentClass",
      "gender",
      "Race",
      "Aggregate %",
      "Maths %",
      "English %",
      "Afrikaans/Isizulu %",
      "Medication",
      "Learner Support",
      "notes",
    ];
    const csvContent = headers.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "students_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (showImportView) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="mb-8">
            <svg width="180" height="140" viewBox="0 0 180 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto">
              <rect x="40" y="20" width="100" height="80" rx="4" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="2"/>
              <rect x="50" y="10" width="80" height="15" rx="2" fill="hsl(var(--primary))" opacity="0.3"/>
              <rect x="50" y="35" width="80" height="55" fill="hsl(var(--background))" stroke="hsl(var(--border))" strokeWidth="1"/>
              {[0, 1, 2, 3].map((row) => (
                <g key={row}>
                  {[0, 1, 2, 3].map((col) => (
                    <rect key={col} x={52 + col * 19} y={37 + row * 13} width="17" height="11" fill={row === 0 ? "hsl(var(--primary))" : "hsl(var(--muted))"} opacity={row === 0 ? 0.5 : 0.3}/>
                  ))}
                </g>
              ))}
              <circle cx="105" cy="105" r="25" fill="hsl(var(--primary))" opacity="0.2"/>
              <path d="M105 95 L105 115 M95 105 L105 95 L115 105" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="15" y="35" width="20" height="12" rx="2" fill="hsl(var(--chart-4))" opacity="0.7"/>
              <rect x="20" y="55" width="20" height="12" rx="2" fill="hsl(var(--chart-1))" opacity="0.7"/>
              <rect x="145" y="30" width="20" height="12" rx="2" fill="hsl(var(--destructive))" opacity="0.6"/>
              <rect x="150" y="50" width="20" height="12" rx="2" fill="hsl(var(--destructive))" opacity="0.6"/>
              <rect x="145" y="70" width="20" height="12" rx="2" fill="hsl(var(--destructive))" opacity="0.6"/>
            </svg>
          </div>
          
          <h2 className="text-xl font-semibold mb-6">1. Download and complete the students template</h2>
          <Button onClick={handleDownloadTemplate} className="mb-10" data-testid="button-download-template">
            Download Template
          </Button>
          
          <h2 className="text-xl font-semibold mb-6">2. Then upload the completed file</h2>
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} data-testid="button-upload-completed">
            Upload Completed File
          </Button>
          
          <button
            onClick={() => setShowImportView(false)}
            className="text-primary mt-8 text-sm hover:underline"
            data-testid="link-back-to-students"
          >
            &lt; Back to Students page
          </button>
        </div>
        
        <CSVImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 max-w-full flex-col overflow-hidden p-6">
      <div className="flex flex-none flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Student Roster</h1>
          <p className="text-muted-foreground mt-1">
            Manage your student list and their characteristics
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowImportView(true)} data-testid="button-import-students">
            <Upload className="h-4 w-4 mr-2" />
            Import Students
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-student">
            <Plus className="h-4 w-4 mr-2" />
            Add Student
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-none flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-students"
          />
        </div>
        <Select value={selectedGrade} onValueChange={setSelectedGrade}>
          <SelectTrigger className="w-56" data-testid="select-grade-filter">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            {staticGrades.map((grade) => (
              <SelectItem key={grade} value={grade}>
                Grade {grade}
              </SelectItem>
            ))}
            <SelectItem value="all">All Grades</SelectItem>
            <SelectItem value="new">New Students</SelectItem>
            <SelectItem value="unallocated">Unallocated Students</SelectItem>
            <SelectItem value="no-id">Students with No IDs</SelectItem>
            <SelectItem value="leaving">Students Leaving</SelectItem>
            <SelectItem value="duplicates">Potentially Duplicate Students</SelectItem>
          </SelectContent>
        </Select>
        {selectedStudents.size > 0 && (
          <Button
            variant="destructive"
            onClick={() => bulkDeleteMutation.mutate(Array.from(selectedStudents))}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete ({selectedStudents.size})
          </Button>
        )}
      </div>

      {students.length === 0 ? (
        <Card className="mt-6 flex-1">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No students yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Get started by adding students manually or importing a CSV file.
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-student">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Student
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6 flex min-h-0 max-w-full flex-1 flex-col overflow-hidden">
          <CardHeader className="flex-none pb-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <span>{filteredStudents.length} Students</span>
              {searchQuery || selectedGrade !== "all" ? (
                <Badge variant="secondary">Filtered</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 min-w-0 flex-1 p-0 [&>div]:h-full [&>div]:max-w-full [&>div]:overflow-auto">
            <Table className="min-w-max">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort("firstName")}
                    >
                      First Name <SortIcon field="firstName" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort("lastName")}
                    >
                      Last Name <SortIcon field="lastName" />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">ID</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort("grade")}
                    >
                      Current Grade <SortIcon field="grade" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort("currentClass")}
                    >
                      Current Class <SortIcon field="currentClass" />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">New Grade</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="whitespace-nowrap">Requests Total</TableHead>
                    {tableCharacteristicColumns.map((char) => (
                      <TableHead key={char.id} className="whitespace-nowrap">
                        {char.name}
                      </TableHead>
                    ))}
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => (
                    <TableRow key={student.id} data-testid={`row-student-${student.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedStudents.has(student.id)}
                          onCheckedChange={() => toggleSelectStudent(student.id)}
                          data-testid={`checkbox-student-${student.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {renderTextCell(
                            student,
                            "firstName",
                            student.firstName,
                            (value) => ({ firstName: value }),
                            true,
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 p-0"
                            onClick={() => openEditDialog(student)}
                            aria-label="Edit student"
                            title="Edit student"
                            data-testid={`button-edit-student-inline-${student.id}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {renderTextCell(
                            student,
                            "lastName",
                            student.lastName,
                            (value) => ({ lastName: value }),
                            true,
                          )}
                          {student.parentRequests && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <MessageSquare className="h-4 w-4 text-muted-foreground" data-testid={`icon-parent-request-${student.id}`} />
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
                          (value) => ({ gender: value }),
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {renderSelectCell(
                          student,
                          "grade",
                          student.grade,
                          gradeOptions,
                          (value) => ({ grade: value }),
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
                          (value) => updateCharacteristicData(student, "newGrade", value),
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
                      {tableCharacteristicColumns.map((char) => {
                        const responses = responseLookup.get(char.name);
                        const options = responses ? Array.from(responses.keys()) : char.options || [];
                        const isNumeric = char.type === "scale" || char.type === "percentage";
                        return (
                          <TableCell key={char.id} className="whitespace-nowrap">
                            {char.type === "category" && options.length > 0
                              ? renderSelectCell(
                                  student,
                                  `characteristic:${char.name}`,
                                  getCharacteristicValue(student, char.name),
                                  options,
                                  (value) => updateCharacteristicData(student, char.name, value),
                                  responses,
                                )
                              : renderTextCell(
                                  student,
                                  `characteristic:${char.name}:${char.type}`,
                                  getCharacteristicValue(student, char.name),
                                  (value) => updateCharacteristicData(student, char.name, value),
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
                            onClick={() => openEditDialog(student)}
                            data-testid={`button-edit-student-${student.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(student.id)}
                            data-testid={`button-delete-student-${student.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={isAddDialogOpen || !!editingStudent} onOpenChange={(open) => {
        if (!open) {
          setIsAddDialogOpen(false);
          setEditingStudent(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStudent ? "Edit Student" : "Add New Student"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Enter first name"
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Enter last name"
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grade">Grade *</Label>
                <Select
                  value={formData.grade}
                  onValueChange={(value) => setFormData({ ...formData, grade: value })}
                >
                  <SelectTrigger data-testid="select-grade">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map(
                      (g) => (
                        <SelectItem key={g} value={g}>
                          Grade {g}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentClass">Current Class</Label>
                <Input
                  id="currentClass"
                  value={formData.currentClass ?? ""}
                  onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                  placeholder="e.g., 3A"
                  data-testid="input-current-class"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={formData.gender ?? ""}
                onValueChange={(value) => setFormData({ ...formData, gender: value })}
              >
                <SelectTrigger data-testid="select-gender">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formCharacteristicColumns.length > 0 && (
              <div className="space-y-4">
                <Label>Characteristics</Label>
                <div className="grid grid-cols-2 gap-4">
                  {formCharacteristicColumns.map((char) => {
                    const responses = responseLookup.get(char.name);
                    const options = responses ? Array.from(responses.keys()) : char.options || [];
                    const isNumeric = char.type === "scale" || char.type === "percentage";
                    const selectedValue = (formData.characteristics as Record<string, string>)?.[char.name] || "";
                    const selectedResponse = responses?.get(selectedValue);
                    return (
                      <div key={char.id} className="space-y-2">
                        <Label htmlFor={char.id} className="text-sm text-muted-foreground">
                          {char.name}
                        </Label>
                        {char.type === "category" && options.length > 0 ? (
                          <Select
                            value={selectedValue || undefined}
                            onValueChange={(value) =>
                              setFormData({
                                ...formData,
                                characteristics: {
                                  ...formData.characteristics,
                                  [char.name]: value,
                                },
                              })
                            }
                          >
                            <SelectTrigger data-testid={`select-char-${char.id}`}>
                              {selectedValue ? (
                                <span className="flex items-center gap-2 truncate">
                                  {selectedResponse && (
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedResponse.color }} />
                                  )}
                                  <span className="truncate">{selectedValue}</span>
                                </span>
                              ) : (
                                <SelectValue placeholder={`Select ${char.name.toLowerCase()}`} />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((opt) => {
                                const response = responses?.get(opt);
                                return (
                                  <SelectItem key={opt} value={opt}>
                                    <span className="flex items-center gap-2">
                                      {response && (
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: response.color }} />
                                      )}
                                      {opt}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={char.id}
                            type={isNumeric ? "number" : "text"}
                            min={isNumeric ? 0 : undefined}
                            max={char.type === "percentage" ? 100 : undefined}
                            value={(formData.characteristics as Record<string, string>)?.[char.name] || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                characteristics: {
                                  ...formData.characteristics,
                                  [char.name]: e.target.value,
                                },
                              })
                            }
                            placeholder={isNumeric ? "Enter number" : `Enter ${char.name.toLowerCase()}`}
                            data-testid={`input-char-${char.id}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes ?? ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add any additional notes about this student..."
                rows={3}
                data-testid="textarea-notes"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parentRequests">Parent Requests</Label>
              <Textarea
                id="parentRequests"
                value={formData.parentRequests ?? ""}
                onChange={(e) => setFormData({ ...formData, parentRequests: e.target.value })}
                placeholder="Document any parent placement requests (e.g., 'Please place with Sarah', 'Avoid being in same class as John')..."
                rows={3}
                data-testid="textarea-parent-requests"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parentNotes">Parent Notes</Label>
              <Textarea
                id="parentNotes"
                value={formData.parentNotes ?? ""}
                onChange={(e) => setFormData({ ...formData, parentNotes: e.target.value })}
                placeholder="Additional notes from parent communications..."
                rows={2}
                data-testid="textarea-parent-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setEditingStudent(null);
                resetForm();
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-student"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingStudent
                ? "Update Student"
                : "Add Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CSVImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} />
    </div>
  );
}
