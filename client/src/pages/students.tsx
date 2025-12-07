import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Search, Users, ChevronUp, ChevronDown, MessageSquare } from "lucide-react";
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
import type { Student, InsertStudent, Characteristic } from "@shared/schema";

type SortField = "firstName" | "lastName" | "grade" | "currentClass";
type SortDirection = "asc" | "desc";

export default function StudentsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [sortField, setSortField] = useState<SortField>("lastName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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
      const matchesSearch =
        student.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.lastName.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesFilter = true;
      if (selectedGrade === "all") {
        matchesFilter = true;
      } else if (selectedGrade === "new") {
        matchesFilter = student.isNew === true;
      } else if (selectedGrade === "unallocated") {
        matchesFilter = !student.currentClass;
      } else if (selectedGrade === "no-id") {
        matchesFilter = !student.studentId;
      } else if (selectedGrade === "leaving") {
        matchesFilter = student.isLeaving === true;
      } else if (selectedGrade === "duplicates") {
        const duplicates = findDuplicates(students);
        matchesFilter = duplicates.some((d) => d.id === student.id);
      } else {
        matchesFilter = student.grade === selectedGrade;
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
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Student Roster</h1>
          <p className="text-muted-foreground mt-1">
            Manage your student list and their characteristics
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-student">
          <Plus className="h-4 w-4 mr-2" />
          Add Student
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
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
        <Card>
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
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <span>{filteredStudents.length} Students</span>
              {searchQuery || selectedGrade !== "all" ? (
                <Badge variant="secondary">Filtered</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("lastName")}
                    >
                      Name <SortIcon field="lastName" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("grade")}
                    >
                      Grade <SortIcon field="grade" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("currentClass")}
                    >
                      Current Class <SortIcon field="currentClass" />
                    </TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Characteristics</TableHead>
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
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{student.lastName}, {student.firstName}</span>
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
                      <TableCell>
                        <Badge variant="outline">Grade {student.grade}</Badge>
                      </TableCell>
                      <TableCell>{student.currentClass || "—"}</TableCell>
                      <TableCell>{student.gender || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(student.characteristics || {})
                            .slice(0, 3)
                            .map(([key, value]) => (
                              <Badge key={key} variant="secondary" className="text-xs">
                                {value}
                              </Badge>
                            ))}
                          {Object.keys(student.characteristics || {}).length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{Object.keys(student.characteristics || {}).length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
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
            </div>
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
                  value={formData.currentClass}
                  onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                  placeholder="e.g., 3A"
                  data-testid="input-current-class"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={formData.gender}
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

            <div className="space-y-2">
              <Label htmlFor="race">Race</Label>
              <Select
                value={(formData.characteristics as Record<string, string>)?.["Race"] || ""}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    characteristics: {
                      ...formData.characteristics,
                      ["Race"]: value,
                    },
                  })
                }
              >
                <SelectTrigger data-testid="select-race">
                  <SelectValue placeholder="Select race" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="White">White</SelectItem>
                  <SelectItem value="Black">Black</SelectItem>
                  <SelectItem value="Indian">Indian</SelectItem>
                  <SelectItem value="Coloured">Coloured</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="aggregate">Aggregate %</Label>
                <Input
                  id="aggregate"
                  type="number"
                  min="0"
                  max="100"
                  value={(formData.characteristics as Record<string, string>)?.["Aggregate %"] || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      characteristics: {
                        ...formData.characteristics,
                        ["Aggregate %"]: e.target.value,
                      },
                    })
                  }
                  placeholder="0-100"
                  data-testid="input-aggregate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maths">Maths %</Label>
                <Input
                  id="maths"
                  type="number"
                  min="0"
                  max="100"
                  value={(formData.characteristics as Record<string, string>)?.["Maths %"] || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      characteristics: {
                        ...formData.characteristics,
                        ["Maths %"]: e.target.value,
                      },
                    })
                  }
                  placeholder="0-100"
                  data-testid="input-maths"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="english">English %</Label>
                <Input
                  id="english"
                  type="number"
                  min="0"
                  max="100"
                  value={(formData.characteristics as Record<string, string>)?.["English %"] || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      characteristics: {
                        ...formData.characteristics,
                        ["English %"]: e.target.value,
                      },
                    })
                  }
                  placeholder="0-100"
                  data-testid="input-english"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="afrikaans">Afrikaans/Isizulu %</Label>
                <Input
                  id="afrikaans"
                  type="number"
                  min="0"
                  max="100"
                  value={(formData.characteristics as Record<string, string>)?.["Afrikaans/Isizulu %"] || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      characteristics: {
                        ...formData.characteristics,
                        ["Afrikaans/Isizulu %"]: e.target.value,
                      },
                    })
                  }
                  placeholder="0-100"
                  data-testid="input-afrikaans"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="medication">Medication</Label>
                <Select
                  value={(formData.characteristics as Record<string, string>)?.["Medication"] || ""}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      characteristics: {
                        ...formData.characteristics,
                        ["Medication"]: value,
                      },
                    })
                  }
                >
                  <SelectTrigger data-testid="select-medication">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="learnerSupport">Learner Support</Label>
                <Select
                  value={(formData.characteristics as Record<string, string>)?.["Learner Support"] || ""}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      characteristics: {
                        ...formData.characteristics,
                        ["Learner Support"]: value,
                      },
                    })
                  }
                >
                  <SelectTrigger data-testid="select-learner-support">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {characteristics.length > 0 && (
              <div className="space-y-4">
                <Label>Characteristics</Label>
                <div className="grid grid-cols-2 gap-4">
                  {characteristics.map((char) => (
                    <div key={char.id} className="space-y-2">
                      <Label htmlFor={char.id} className="text-sm text-muted-foreground">
                        {char.name}
                      </Label>
                      {char.type === "category" && char.options && char.options.length > 0 ? (
                        <Select
                          value={(formData.characteristics as Record<string, string>)?.[char.id] || ""}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              characteristics: {
                                ...formData.characteristics,
                                [char.id]: value,
                              },
                            })
                          }
                        >
                          <SelectTrigger data-testid={`select-char-${char.id}`}>
                            <SelectValue placeholder={`Select ${char.name.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {char.options.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={char.id}
                          value={(formData.characteristics as Record<string, string>)?.[char.id] || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              characteristics: {
                                ...formData.characteristics,
                                [char.id]: e.target.value,
                              },
                            })
                          }
                          placeholder={`Enter ${char.name.toLowerCase()}`}
                          data-testid={`input-char-${char.id}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
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
                value={formData.parentRequests}
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
                value={formData.parentNotes}
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
    </div>
  );
}
