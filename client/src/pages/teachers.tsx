import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Search, GraduationCap, Upload, Download } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Teacher, InsertTeacher } from "@shared/schema";

type SortField = "firstName" | "lastName" | "email" | "currentClass" | "surveyStatus";
type SortDirection = "asc" | "desc";

export default function TeachersPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeachers, setSelectedTeachers] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [showImportView, setShowImportView] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [sortField, setSortField] = useState<SortField>("lastName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [formData, setFormData] = useState<Partial<InsertTeacher>>({
    firstName: "",
    lastName: "",
    email: "",
    currentClass: "",
    allocatedClass: "",
    surveyStatus: "Not Sent",
    surveyDate: "",
  });

  const { data: teachers = [], isLoading } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertTeacher) => apiRequest("POST", "/api/teachers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "Teacher added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add teacher", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertTeacher> }) =>
      apiRequest("PATCH", `/api/teachers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      setEditingTeacher(null);
      resetForm();
      toast({ title: "Teacher updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update teacher", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/teachers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      toast({ title: "Teacher deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete teacher", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/teachers/bulk-delete", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      setSelectedTeachers(new Set());
      toast({ title: "Teachers deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete teachers", variant: "destructive" });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: (teachersList: InsertTeacher[]) =>
      apiRequest("POST", "/api/teachers/bulk-import", { teachers: teachersList }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      setIsImportDialogOpen(false);
      toast({ title: "Teachers imported successfully" });
    },
    onError: () => {
      toast({ title: "Failed to import teachers", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      currentClass: "",
      allocatedClass: "",
      surveyStatus: "Not Sent",
      surveyDate: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }

    if (editingTeacher) {
      updateMutation.mutate({ id: editingTeacher.id, data: formData as InsertTeacher });
    } else {
      createMutation.mutate(formData as InsertTeacher);
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter((line) => line.trim());
      if (lines.length < 2) {
        toast({ title: "CSV file is empty or invalid", variant: "destructive" });
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const teachersList: InsertTeacher[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));
        const teacher: Partial<InsertTeacher> = {};

        headers.forEach((header, index) => {
          const value = values[index] || "";
          if (header === "first name" || header === "firstname") {
            teacher.firstName = value;
          } else if (header === "last name" || header === "lastname" || header === "surname") {
            teacher.lastName = value;
          } else if (header === "email") {
            teacher.email = value;
          } else if (header === "current class" || header === "currentclass" || header === "class") {
            teacher.currentClass = value;
          } else if (header === "allocated class" || header === "allocatedclass") {
            teacher.allocatedClass = value;
          } else if (header === "survey status" || header === "surveystatus") {
            teacher.surveyStatus = value || "Not Sent";
          } else if (header === "survey date" || header === "surveydate") {
            teacher.surveyDate = value;
          }
        });

        if (teacher.firstName && teacher.lastName && teacher.email) {
          teachersList.push(teacher as InsertTeacher);
        }
      }

      if (teachersList.length === 0) {
        toast({ title: "No valid teachers found in CSV", variant: "destructive" });
        return;
      }

      bulkImportMutation.mutate(teachersList);
    };

    reader.readAsText(file);
    event.target.value = "";
  };

  const handleExport = () => {
    if (teachers.length === 0) {
      toast({ title: "No teachers to export", variant: "destructive" });
      return;
    }

    const csvRows = ["First Name,Last Name,Email,Current Class,Allocated Class,Survey Status,Survey Date"];

    teachers.forEach((teacher) => {
      csvRows.push(
        `"${teacher.firstName}","${teacher.lastName}","${teacher.email}","${teacher.currentClass || ""}","${teacher.allocatedClass || ""}","${teacher.surveyStatus || ""}","${teacher.surveyDate || ""}"`
      );
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `teachers-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export complete",
      description: `Exported ${teachers.length} teachers`,
    });
  };

  const handleDownloadTemplate = () => {
    const headers = ["firstName", "lastName", "email", "currentClass", "allocatedClass"];
    const csvContent = headers.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "teachers_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredTeachers = teachers
    .filter((teacher) => {
      const matchesSearch =
        teacher.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        teacher.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    })
    .sort((a, b) => {
      const aValue = a[sortField] || "";
      const bValue = b[sortField] || "";
      const comparison = aValue.localeCompare(bValue);
      return sortDirection === "asc" ? comparison : -comparison;
    });

  const toggleSelectAll = () => {
    if (selectedTeachers.size === filteredTeachers.length) {
      setSelectedTeachers(new Set());
    } else {
      setSelectedTeachers(new Set(filteredTeachers.map((t) => t.id)));
    }
  };

  const toggleSelectTeacher = (id: string) => {
    const newSelected = new Set(selectedTeachers);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTeachers(newSelected);
  };

  const getSurveyStatusBadge = (status: string | null) => {
    switch (status) {
      case "Completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "Sent":
        return <Badge variant="secondary">Sent</Badge>;
      case "Not Sent":
      default:
        return <Badge variant="outline">Not Sent</Badge>;
    }
  };

  const openEditDialog = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.email,
      currentClass: teacher.currentClass || "",
      allocatedClass: teacher.allocatedClass || "",
      surveyStatus: teacher.surveyStatus || "Not Sent",
      surveyDate: teacher.surveyDate || "",
    });
    setIsAddDialogOpen(true);
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
          
          <h2 className="text-xl font-semibold mb-6">1. Download and complete the teachers template</h2>
          <Button onClick={handleDownloadTemplate} className="mb-10" data-testid="button-download-template">
            Download Template
          </Button>
          
          <h2 className="text-xl font-semibold mb-6">2. Then upload the completed file</h2>
          <Button 
            variant="outline" 
            onClick={() => document.getElementById("teacher-csv-upload-import")?.click()} 
            data-testid="button-upload-completed"
          >
            Upload Completed File
          </Button>
          <input
            id="teacher-csv-upload-import"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              handleFileUpload(e);
              setShowImportView(false);
            }}
          />
          
          <button
            onClick={() => setShowImportView(false)}
            className="text-primary mt-8 text-sm hover:underline"
            data-testid="link-back-to-teachers"
          >
            &lt; Back to Teachers page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Teachers</CardTitle>
            {teachers.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {teachers.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImportView(true)}
              data-testid="button-import-teachers"
            >
              <Upload className="h-4 w-4 mr-1" />
              Import Teachers
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={teachers.length === 0}
              data-testid="button-export-teachers"
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            {selectedTeachers.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedTeachers))}
                data-testid="button-delete-selected-teachers"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove ({selectedTeachers.size})
              </Button>
            )}
            <Button
              onClick={() => {
                resetForm();
                setEditingTeacher(null);
                setIsAddDialogOpen(true);
              }}
              data-testid="button-add-teacher"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Teacher
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search teachers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
                data-testid="input-search-teachers"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {teachers.length === 0
                ? "No teachers added yet. Click 'Add Teacher' to get started."
                : "No teachers match your search."}
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedTeachers.size === filteredTeachers.length && filteredTeachers.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all-teachers"
                      />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleSort("firstName")}
                      data-testid="header-first-name"
                    >
                      First Name
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleSort("lastName")}
                      data-testid="header-last-name"
                    >
                      Last Name
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleSort("email")}
                      data-testid="header-email"
                    >
                      Email
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleSort("currentClass")}
                      data-testid="header-current-class"
                    >
                      Current School Year
                    </TableHead>
                    <TableHead data-testid="header-allocated-class">Allocated to Class</TableHead>
                    <TableHead
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleSort("surveyStatus")}
                      data-testid="header-survey-status"
                    >
                      Survey Status
                    </TableHead>
                    <TableHead data-testid="header-survey-date">Survey Date</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTeachers.map((teacher) => (
                    <TableRow key={teacher.id} data-testid={`row-teacher-${teacher.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedTeachers.has(teacher.id)}
                          onCheckedChange={() => toggleSelectTeacher(teacher.id)}
                          data-testid={`checkbox-teacher-${teacher.id}`}
                        />
                      </TableCell>
                      <TableCell data-testid={`text-first-name-${teacher.id}`}>{teacher.firstName}</TableCell>
                      <TableCell data-testid={`text-last-name-${teacher.id}`}>{teacher.lastName}</TableCell>
                      <TableCell data-testid={`text-email-${teacher.id}`}>{teacher.email}</TableCell>
                      <TableCell data-testid={`text-current-class-${teacher.id}`}>{teacher.currentClass || "-"}</TableCell>
                      <TableCell data-testid={`text-allocated-class-${teacher.id}`}>{teacher.allocatedClass || "-"}</TableCell>
                      <TableCell data-testid={`text-survey-status-${teacher.id}`}>
                        {getSurveyStatusBadge(teacher.surveyStatus)}
                      </TableCell>
                      <TableCell data-testid={`text-survey-date-${teacher.id}`}>{teacher.surveyDate || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditDialog(teacher)}
                            data-testid={`button-edit-teacher-${teacher.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(teacher.id)}
                            data-testid={`button-delete-teacher-${teacher.id}`}
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
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTeacher ? "Edit Teacher" : "Add Teacher"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName || ""}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  data-testid="input-teacher-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName || ""}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  data-testid="input-teacher-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                data-testid="input-teacher-email"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentClass">Current Class</Label>
                <Input
                  id="currentClass"
                  value={formData.currentClass || ""}
                  onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                  data-testid="input-teacher-current-class"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="allocatedClass">Allocated Class</Label>
                <Input
                  id="allocatedClass"
                  value={formData.allocatedClass || ""}
                  onChange={(e) => setFormData({ ...formData, allocatedClass: e.target.value })}
                  data-testid="input-teacher-allocated-class"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-teacher"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
