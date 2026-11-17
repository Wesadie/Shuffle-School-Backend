import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Search, Users, ChevronUp, ChevronDown, Upload, Download, Settings } from "lucide-react";
import { CSVImportDialog } from "@/components/csv-import-dialog";
import { StudentFormFields } from "@/components/student-form-fields";
import { StudentRosterRow } from "@/components/student-roster-row";
import { useStudentRoster, useSaveRosterStudent } from "@/hooks/use-student-roster";
import { getCharacteristics, getStudentDisplayId, uniqueOptions } from "@/lib/student-roster-display";
import { changedStudentFields, normalizeRosterGrade } from "@shared/student-roster";
import { characteristicImportError } from "@shared/learner-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { downloadXlsx, type SpreadsheetCell } from "@/lib/xlsx-export";
import { characteristicValueToArray, formatCharacteristicValue, normalizeResponses } from "@shared/characteristics";
import type { Student, InsertStudent, Characteristic, ClassConfig, CharacteristicResponse } from "@shared/schema";
import { getNextGrade } from "@shared/grades";

type SortField = "firstName" | "lastName" | "grade" | "currentClass";
type SortDirection = "asc" | "desc";
const EMPTY_CHARACTERISTICS: Characteristic[] = [];
const EMPTY_CLASSES: ClassConfig[] = [];

export default function StudentsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isCharacteristicImportDialogOpen, setIsCharacteristicImportDialogOpen] = useState(false);
  const [showImportView, setShowImportView] = useState(false);

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [sortField, setSortField] = useState<SortField>("lastName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(0);
  const deferredSearch = useDeferredValue(searchQuery);
  const saveRosterStudent = useSaveRosterStudent();

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

  const { students, isLoading, isFetching, error: rosterError, refetch, options: rosterOptions, optionsError, refetchOptions } = useStudentRoster(selectedGrade);

  const { data: characteristics = EMPTY_CHARACTERISTICS } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
  });

  const { data: classConfigs = EMPTY_CLASSES } = useQuery<ClassConfig[]>({
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
    mutationFn: ({ student, data }: { student: Student; data: Partial<InsertStudent> }) =>
      saveRosterStudent(student, changedStudentFields(student, data)),
    onSuccess: () => {
      setEditingStudent(null);
      resetForm();
      toast({ title: "Student updated successfully" });
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
    const editedCharacteristics = editingStudent ? changedStudentFields(editingStudent, formData).characteristics : formData.characteristics;
    for (const [name, value] of Object.entries(editedCharacteristics || {})) {
      const characteristic = characteristics.find((c) => c.name === name);
      const invalid = characteristicImportError(formatCharacteristicValue(value), characteristic?.type);
      if (invalid) { toast({ title: `${name} ${invalid}`, variant: "destructive" }); return; }
    }

    if (editingStudent) {
      updateMutation.mutate({ student: editingStudent, data: formData as InsertStudent });
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
  const tableCharacteristicColumns = useMemo(() => characteristics.filter(
    (char) => !["studentId", "newGrade"].includes(char.name),
  ), [characteristics]);
  const formCharacteristicColumns = tableCharacteristicColumns;

  const responseLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, CharacteristicResponse>>();
    characteristics.forEach((char) => {
      if (char.type !== "category") return;
      lookup.set(char.name, new Map(normalizeResponses(char).map((response) => [response.name, response])));
    });
    return lookup;
  }, [characteristics]);

  const gradeOptions = useMemo(() => uniqueOptions([
    ...(rosterOptions?.grades || []).map(normalizeRosterGrade),
    ...classConfigs.map((config) => normalizeRosterGrade(config.grade)), "R", ...staticGrades,
  ]), [rosterOptions, classConfigs]);
  const currentClassOptions = useMemo(() => uniqueOptions([
    ...(rosterOptions?.currentClasses || []), ...classConfigs.map((config) => config.name),
  ]), [rosterOptions, classConfigs]);
  const newGradeOptions = useMemo(() => uniqueOptions([
    ...(rosterOptions?.newGrades || []), ...(rosterOptions?.grades || []).map(getNextGrade),
    ...classConfigs.map((config) => config.grade), ...staticGrades,
  ]), [rosterOptions, classConfigs]);
  const genderOptions = useMemo(() => uniqueOptions([
    ...(rosterOptions?.genders || []), "male", "female", "other",
  ]), [rosterOptions]);

  const filteredStudents = useMemo(() => {
    const search = deferredSearch.toLowerCase();
    const duplicateIds = new Set<string>();
    if (selectedGrade === "duplicates") {
      const counts = new Map<string, number>();
      for (const student of students) {
        const name = student.firstName.toLowerCase() + '-' + student.lastName.toLowerCase();
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      for (const student of students) if ((counts.get(student.firstName.toLowerCase() + '-' + student.lastName.toLowerCase()) || 0) > 1) duplicateIds.add(student.id);
    }
    return students.filter((student) => {
      const displayId = getStudentDisplayId(student);
      const matchesSearch = student.firstName.toLowerCase().includes(search) || student.lastName.toLowerCase().includes(search) || displayId.toLowerCase().includes(search);
      const matchesFilter = selectedGrade === "new" ? student.isNew === true
        : selectedGrade === "unallocated" ? !student.currentClass
        : selectedGrade === "no-id" ? displayId === "—"
        : selectedGrade === "leaving" ? student.isLeaving === true
        : selectedGrade === "duplicates" ? duplicateIds.has(student.id) : true;
      return matchesSearch && matchesFilter;
    }).sort((a, b) => {
      const comparison = (a[sortField] || "").localeCompare(b[sortField] || "");
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [students, deferredSearch, selectedGrade, sortField, sortDirection]);
  useEffect(() => { setPage(0); }, [selectedGrade, deferredSearch, sortField, sortDirection]);
  const lastPage = Math.max(0, Math.ceil(filteredStudents.length / 50) - 1);
  const currentPage = Math.min(page, lastPage);
  const visibleStudents = filteredStudents.slice(currentPage * 50, (currentPage + 1) * 50);

  const toggleSelectAll = () => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map((s) => s.id)));
    }
  };

  const toggleSelectStudent = useCallback((id: string) => {
    setSelectedStudents((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const deleteStudent = useCallback((id: string) => deleteMutation.mutate(id), [deleteMutation.mutate]);

  const openEditDialog = useCallback((student: Student) => {
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
  }, []);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-3 w-3 ml-1 inline" />
    ) : (
      <ChevronDown className="h-3 w-3 ml-1 inline" />
    );
  };

  const handleDownloadTemplate = () => {
    const csvHeaders = [
      "Student ID",
      "First Name",
      "Last Name",
      "Gender",
      "Current Grade",
      "Current Class",
      ...formCharacteristicColumns.map((characteristic) => characteristic.name),
    ];
    const csvContent = `${csvHeaders.map((header) => `"${header.replace(/"/g, '""')}"`).join(";")}\r\n`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "students_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export the learners currently represented by the roster (respects the
  // active Grade filter, special filters and search, in the roster's sort
  // order) with their actual stored data — not the blank import template.
  const handleExportStudents = () => {
    if (filteredStudents.length === 0) {
      toast({
        title: "No students to export",
        description: "No learners match the current filter.",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Student ID",
      "First Name",
      "Last Name",
      "Gender",
      "Current Grade",
      "Current Class",
      "Notes",
      "Parent Requests",
      "Parent Notes",
      ...formCharacteristicColumns.map((characteristic) => characteristic.name),
    ];

    const rows: SpreadsheetCell[][] = [
      headers,
      ...filteredStudents.map((student) => {
        const studentCharacteristics = getCharacteristics(student);
        return [
          student.studentId || formatCharacteristicValue(studentCharacteristics.studentId) || "",
          student.firstName,
          student.lastName,
          student.gender || "",
          student.grade || "",
          student.currentClass || "",
          student.notes || "",
          student.parentRequests || "",
          student.parentNotes || "",
          ...formCharacteristicColumns.map((characteristic) => {
            const value = studentCharacteristics[characteristic.name];
            return value == null ? "" : characteristicValueToArray(value).join(", ");
          }),
        ];
      }),
    ];

    downloadXlsx(`students-export-${new Date().toISOString().slice(0, 10)}`, [
      { name: "Students", rows },
    ]);
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
        
        <CSVImportDialog
          open={isImportDialogOpen}
          onOpenChange={setIsImportDialogOpen}
          characteristics={formCharacteristicColumns}
        />
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
          <Button variant="outline" onClick={() => setIsCharacteristicImportDialogOpen(true)} data-testid="button-import-characteristics">
            <Upload className="h-4 w-4 mr-2" />
            Import Characteristics
          </Button>
          <Button variant="outline" onClick={handleExportStudents} disabled={isLoading || !!rosterError || searchQuery !== deferredSearch} data-testid="button-export-students">
            <Download className="h-4 w-4 mr-2" />
            Export Students
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
        <Select value={selectedGrade} onValueChange={(value) => { setSelectedGrade(value); setSelectedStudents(new Set()); }}>
          <SelectTrigger className="w-56" data-testid="select-grade-filter">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            {gradeOptions.map((grade) => (
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
      {optionsError && <p role="alert" className="mt-2 text-sm text-destructive">Some roster choices could not be loaded. <button type="button" className="underline" onClick={() => void refetchOptions()}>Retry choices</button></p>}

      {isLoading ? <Card className="mt-6 flex-1"><CardContent className="p-6 space-y-4"><p role="status" className="text-sm text-muted-foreground">Loading learners for this filter…</p>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</CardContent></Card>
        : rosterError ? <Card className="mt-6"><CardContent className="p-6"><p role="alert">Unable to load this roster. Your data has not been changed.</p><Button variant="outline" onClick={() => void refetch()}>Retry</Button></CardContent></Card>
        : students.length === 0 ? (
        <Card className="mt-6 flex-1">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">{selectedGrade === "all" ? "No students yet" : "No students in this grade"}</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              {selectedGrade === "all" ? "Get started by adding students manually or importing an Excel (.xlsx) or CSV (.csv) file." : "Choose another grade or add a student to this grade."}
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-student">
              <Plus className="h-4 w-4 mr-2" />
              Add Student
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6 flex min-h-0 max-w-full flex-1 flex-col overflow-hidden">
          <CardHeader className="flex-none pb-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <span>{filteredStudents.length} Students</span>
              {isFetching && <span role="status" className="text-xs font-normal text-muted-foreground">Refreshing…</span>}
              {searchQuery || selectedGrade !== "all" ? (
                <Badge variant="secondary">Filtered</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 min-w-0 flex-1 p-0 [&>div]:h-full [&>div]:max-w-full [&>div]:overflow-auto">
            <Table className="min-w-max">
                <TableHeader className="sticky top-0 z-20 bg-background">
                  <TableRow>
                    <TableHead rowSpan={2} className="w-12 align-middle bg-background">
                      <Checkbox
                        checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0}
                        disabled={searchQuery !== deferredSearch}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead
                      rowSpan={2}
                      className="sticky left-0 z-30 w-36 min-w-[144px] max-w-[144px] cursor-pointer select-none whitespace-nowrap align-middle bg-background px-2 shadow-[inset_-1px_0_0_hsl(var(--border))] sm:w-44 sm:min-w-[176px] sm:max-w-[176px]"
                      onClick={() => handleSort("firstName")}
                    >
                      First Name <SortIcon field="firstName" />
                    </TableHead>
                    <TableHead
                      rowSpan={2}
                      className="sticky left-36 z-30 w-36 min-w-[144px] max-w-[144px] cursor-pointer select-none whitespace-nowrap align-middle bg-background px-2 shadow-[inset_-1px_0_0_hsl(var(--border))] sm:left-44 sm:w-44 sm:min-w-[176px] sm:max-w-[176px]"
                      onClick={() => handleSort("lastName")}
                    >
                      Last Name <SortIcon field="lastName" />
                    </TableHead>
                    <TableHead rowSpan={2} className="whitespace-nowrap align-middle bg-background">ID</TableHead>
                    <TableHead rowSpan={2} className="align-middle bg-background">Gender</TableHead>
                    <TableHead
                      rowSpan={2}
                      className="cursor-pointer select-none whitespace-nowrap align-middle bg-background"
                      onClick={() => handleSort("grade")}
                    >
                      Current Grade <SortIcon field="grade" />
                    </TableHead>
                    <TableHead
                      rowSpan={2}
                      className="cursor-pointer select-none whitespace-nowrap align-middle bg-background"
                      onClick={() => handleSort("currentClass")}
                    >
                      Current Class <SortIcon field="currentClass" />
                    </TableHead>
                    <TableHead rowSpan={2} className="whitespace-nowrap align-middle bg-background">New Grade</TableHead>
                    <TableHead rowSpan={2} className="align-middle bg-background">Notes</TableHead>
                    <TableHead className="whitespace-nowrap border-r border-orange-500 bg-orange-400 text-orange-950">
                      <div className="px-2 pt-3 text-xs font-semibold uppercase tracking-wider">REQUESTS</div>
                    </TableHead>
                    {tableCharacteristicColumns.length > 0 && (
                      <TableHead
                        className="whitespace-nowrap border-r border-amber-500 bg-amber-300 text-amber-950"
                        colSpan={tableCharacteristicColumns.length}
                      >
                        <div className="flex items-center justify-between px-2 pt-3 text-xs font-semibold uppercase tracking-wider">
                          <span>CHARACTERISTICS</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 p-0 text-amber-950 hover:bg-amber-400 hover:text-amber-950"
                            asChild
                          >
                            <a href="/characteristics" aria-label="Open characteristics settings" data-testid="button-open-characteristics">
                              <Settings className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </TableHead>
                    )}
                    <TableHead rowSpan={2} className="w-24 whitespace-nowrap align-middle bg-background">Actions</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="whitespace-nowrap border-r border-orange-500 bg-orange-400 text-orange-950">
                      Total
                    </TableHead>
                    {tableCharacteristicColumns.map((char) => (
                      <TableHead key={char.id} className="whitespace-nowrap bg-amber-300 text-amber-950">
                        {char.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStudents.map((student) => <StudentRosterRow
                    key={student.id} student={student} selected={selectedStudents.has(student.id)}
                    characteristicColumns={tableCharacteristicColumns} responseLookup={responseLookup}
                    gradeOptions={gradeOptions} genderOptions={genderOptions} currentClassOptions={currentClassOptions} newGradeOptions={newGradeOptions}
                    onSelect={toggleSelectStudent} onEdit={openEditDialog} onDelete={deleteStudent} onSave={saveRosterStudent}
                  />)}

                </TableBody>
              </Table>
          </CardContent>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
            <span>Showing {filteredStudents.length ? currentPage * 50 + 1 : 0}–{Math.min((currentPage + 1) * 50, filteredStudents.length)} of {filteredStudents.length}. Select all and export include every filtered learner.</span>
            <div className="flex gap-2"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button variant="outline" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
          </div>
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
          <StudentFormFields
            formData={formData}
            setFormData={setFormData}
            characteristics={formCharacteristicColumns}
          />
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

      <CSVImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        characteristics={formCharacteristicColumns}
      />
      <CSVImportDialog
        open={isCharacteristicImportDialogOpen}
        onOpenChange={setIsCharacteristicImportDialogOpen}
        characteristics={formCharacteristicColumns}
        importType="characteristics"
      />
    </div>
  );
}
