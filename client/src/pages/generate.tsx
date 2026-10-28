import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, Plus, Trash2, Users, AlertCircle, CheckCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getStudentTargetGrade, isIncomingGradeRAwaitingAllocation, normalizeGradeValue } from "@shared/grades";
import type { ClassConfig, ClassGenerationResult, InsertClassConfig, Placement, Student, Rule, Characteristic, Teacher } from "@shared/schema";

export default function GeneratePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [placementGrade, setPlacementGrade] = useState("1");
  const [placementMode, setPlacementMode] = useState<"unallocated" | "regenerate-grade" | "full">("unallocated");
  const [confirmGenerationMode, setConfirmGenerationMode] = useState<"regenerate-grade" | "full" | null>(null);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    grade: string;
    capacity: number;
    teacherId: string;
  }>({ name: "", grade: "", capacity: 30, teacherId: "none" });

  const [formData, setFormData] = useState<Partial<InsertClassConfig>>({
    name: "",
    grade: "",
    capacity: 30,
  });

  const { data: classConfigs = [], isLoading: configsLoading } = useQuery<ClassConfig[]>({
    queryKey: ["/api/class-configs"],
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const { data: placementState, isLoading: placementsLoading } = useQuery<{ placements: Placement[]; revision: number }>({
    queryKey: ["/api/placements/state"],
  });
  const placements = placementState?.placements ?? [];

  const { data: rules = [] } = useQuery<Rule[]>({
    queryKey: ["/api/rules"],
  });

  const { data: characteristics = [] } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
  });

  const { data: teachers = [] } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const teacherClasses = teachers
    .filter((t) => t.currentClass && t.currentClass.trim() !== "")
    .map((t) => ({
      teacherId: t.id,
      teacherName: `${t.firstName} ${t.lastName}`,
      currentClass: t.currentClass!,
    }))
    .sort((a, b) => a.currentClass.localeCompare(b.currentClass));

  const createConfigMutation = useMutation({
    mutationFn: (data: InsertClassConfig) => apiRequest("POST", "/api/class-configs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-configs"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "Class added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add class", variant: "destructive" });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/class-configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-configs"] });
      toast({ title: "Class deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete class", variant: "destructive" });
    },
  });

  // Edit an existing class: update name/grade/capacity via the existing class-config
  // API, then reassign the teacher by updating their currentClass through the
  // existing teacher API. Teacher assignments are stored by class name, so a
  // rename also moves the assigned teacher to the new name.
  const updateConfigMutation = useMutation({
    mutationFn: async ({ configId, name, grade, capacity, teacherId }: {
      configId: string;
      name: string;
      grade: string;
      capacity: number;
      teacherId: string;
    }) => {
      const original = classConfigs.find((c) => c.id === configId);
      if (!original) throw new Error("Class not found");

      await apiRequest("PATCH", `/api/class-configs/${configId}`, { name, grade, capacity });

      const previousTeacher = teachers.find((t) => t.currentClass === original.name);
      if (teacherId === "none") {
        if (previousTeacher) {
          await apiRequest("PATCH", `/api/teachers/${previousTeacher.id}`, { currentClass: null });
        }
      } else {
        const selected = teachers.find((t) => t.id === teacherId);
        if (!selected) throw new Error("Selected teacher not found");
        await apiRequest("PATCH", `/api/teachers/${selected.id}`, { currentClass: name });
        if (previousTeacher && previousTeacher.id !== selected.id) {
          await apiRequest("PATCH", `/api/teachers/${previousTeacher.id}`, { currentClass: null });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      setEditingConfigId(null);
      toast({ title: "Class updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update class", description: error.message || undefined, variant: "destructive" });
    },
  });

  const openEditDialog = (config: ClassConfig) => {
    const assignedTeacher = teachers.find((t) => t.currentClass === config.name);
    setEditForm({
      name: config.name,
      grade: config.grade,
      capacity: config.capacity ?? 30,
      teacherId: assignedTeacher?.id ?? "none",
    });
    setEditingConfigId(config.id);
  };

  const handleEditSubmit = () => {
    if (!editingConfigId) return;
    if (!editForm.name.trim() || !editForm.grade.trim()) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    updateConfigMutation.mutate({ configId: editingConfigId, ...editForm, name: editForm.name.trim(), grade: editForm.grade.trim() });
  };

  const generateMutation = useMutation({
    mutationFn: async (options: { grade?: string; mode: "unallocated" | "regenerate-grade" | "full" }) => {
      const stateResponse = await apiRequest("GET", "/api/placements/state");
      const state = await stateResponse.json() as { revision: number };
      return apiRequest("POST", "/api/generate-classes", {
        expectedRevision: state.revision,
        mode: options.mode,
        ...(options.grade ? { grade: options.grade } : {}),
      });
    },
    onSuccess: async (response) => {
      const result = await response.json() as ClassGenerationResult;
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/placements/state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsGenerating(false);
      const conflictSummary = result.conflicts.slice(0, 3).map((conflict) => conflict.message).join("; ");
      toast({
        title: result.conflicts.length > 0 ? "Classes generated with conflicts" : "Classes generated successfully!",
        description: conflictSummary || undefined,
      });
      setLocation("/review");
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/placements/state"] });
      setIsGenerating(false);
      const isLimit = error.message.includes("TRIAL_SOLVER_LIMIT_REACHED");
      const isExpired = error.message.includes("TRIAL_EXPIRED");
      let serverMessage: string | undefined;
      try {
        const responseBody = error.message.slice(error.message.indexOf("{"));
        serverMessage = JSON.parse(responseBody).error;
      } catch {
        serverMessage = undefined;
      }
      toast({
        title: isLimit ? "Trial solver limit reached" : isExpired ? "Trial expired" : "Failed to generate classes",
        description: isLimit
          ? "You have used all 3 trial generations. Upgrade to generate more class lists."
          : isExpired
            ? "Your trial has expired. This workspace is now read-only until you upgrade."
            : serverMessage,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      grade: "",
      capacity: 30,
    });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.grade) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    createConfigMutation.mutate(formData as InsertClassConfig);
  };

  const handleGenerate = () => {
    const selectedGrade = placementGrade === "all" ? undefined : placementGrade;
    const mode = placementMode === "full" ? "full" : placementMode;
    if ((mode === "regenerate-grade" || mode === "full") && confirmGenerationMode !== mode) {
      setConfirmGenerationMode(mode);
      return;
    }
    setConfirmGenerationMode(null);
    setIsGenerating(true);
    generateMutation.mutate({ grade: selectedGrade, mode });
  };

  const studentsAwaitingAllocation = students.filter(isIncomingGradeRAwaitingAllocation);
  const studentsWithoutTargetGrade = students.filter((student) => !isIncomingGradeRAwaitingAllocation(student) && !getStudentTargetGrade(student));
  const placementCandidates = students.filter((student) => !isIncomingGradeRAwaitingAllocation(student));
  const grades = Array.from(new Set([
    ...placementCandidates.map(getStudentTargetGrade).filter(Boolean),
    ...classConfigs.map((config) => normalizeGradeValue(config.grade)),
  ])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const selectedDestinationGrade = placementGrade === "all" ? null : placementGrade;
  const selectedGradeCandidates = placementCandidates.filter((student) => !selectedDestinationGrade || getStudentTargetGrade(student) === selectedDestinationGrade);
  const selectedGradePlacedIds = new Set(placements
    .filter((placement) => selectedGradeCandidates.some((student) => student.id === placement.studentId))
    .map((placement) => placement.studentId));
  const selectedGradeUnallocated = selectedGradeCandidates.length - selectedGradePlacedIds.size;
  const gradeCapacityIssues = grades.flatMap((grade) => {
    const learnerCount = placementCandidates.filter((student) => getStudentTargetGrade(student) === grade).length;
    const capacity = classConfigs
      .filter((config) => normalizeGradeValue(config.grade) === grade)
      .reduce((sum, config) => sum + (config.capacity || 30), 0);
    return capacity < learnerCount ? [{ grade, learnerCount, capacity }] : [];
  });
  const canGenerate = placementCandidates.length > 0 && studentsWithoutTargetGrade.length === 0 && gradeCapacityIssues.length === 0;

  const isLoading = configsLoading || studentsLoading || placementsLoading;
  const accountContext = user?.accountContext;
  const trialUsesRemaining = accountContext?.subscriptionStatus === "trialing"
    ? Math.max(0, 3 - (accountContext.successfulSolverGenerations || 0))
    : null;
  const trialEndsAt = accountContext?.trialEndsAt ? new Date(accountContext.trialEndsAt) : null;
  const trialTimeRemaining = trialEndsAt ? Math.max(0, trialEndsAt.getTime() - Date.now()) : null;
  const trialDaysRemaining = trialTimeRemaining === null ? null : Math.ceil(trialTimeRemaining / (24 * 60 * 60 * 1000));

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Generate Classes</h1>
          <p className="text-muted-foreground mt-1">
            Configure target classes and choose which learner placements to generate
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-class">
            <Plus className="h-4 w-4 mr-2" />
            Add Class
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating || (placementMode !== "full" && (selectedGradeCandidates.length === 0 || (placementMode === "unallocated" && selectedGradeUnallocated === 0)))}
            data-testid="button-generate"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {confirmGenerationMode === "regenerate-grade" ? "Confirm Grade Regeneration" : confirmGenerationMode === "full" ? "Confirm Full Generation" : isGenerating ? "Generating..." : "Generate Classes"}
          </Button>
        </div>
      </div>

      <Card data-testid="card-placement-generation-options">
        <CardHeader>
          <CardTitle className="text-base">Placement generation</CardTitle>
          <CardDescription>Existing placements remain protected unless you choose to regenerate the selected grade or run a full generation.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="placement-grade">Destination grade</Label>
            <Select value={placementGrade} onValueChange={(value) => { setPlacementGrade(value); setConfirmGenerationMode(null); }}>
              <SelectTrigger id="placement-grade" data-testid="select-placement-grade"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 7 }, (_, index) => String(index + 1)).map((grade) => (
                  <SelectItem key={grade} value={grade}>Grade {grade} Placement</SelectItem>
                ))}
                {grades.filter((grade) => !/^[1-7]$/.test(grade)).map((grade) => (
                  <SelectItem key={grade} value={grade}>Grade {grade} Placement</SelectItem>
                ))}
                <SelectItem value="all">All destination grades</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="placement-mode">Generation option</Label>
            <Select value={placementMode} onValueChange={(value: "unallocated" | "regenerate-grade" | "full") => { setPlacementMode(value); setConfirmGenerationMode(null); }}>
              <SelectTrigger id="placement-mode" data-testid="select-placement-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unallocated">Place Unallocated Learners Only</SelectItem>
                <SelectItem value="regenerate-grade">Regenerate All Placements for Selected Grade</SelectItem>
                <SelectItem value="full">Full Generation (all grades)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 grid gap-2 sm:grid-cols-3" data-testid="placement-generation-counts">
            <div className="rounded-md border p-3 text-sm"><span className="font-semibold">Grade {selectedDestinationGrade ?? "All"}</span><span className="block text-muted-foreground">Selected destination</span></div>
            <div className="rounded-md border p-3 text-sm"><span className="font-semibold">{selectedGradeCandidates.length}</span><span className="block text-muted-foreground">Eligible learners</span></div>
            <div className="rounded-md border p-3 text-sm"><span className="font-semibold">{selectedGradePlacedIds.size} placed · {selectedGradeUnallocated} unallocated</span><span className="block text-muted-foreground">Selected destination grade</span></div>
          </div>
          {placementMode === "regenerate-grade" && (
            <Alert variant="destructive" className="md:col-span-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Regenerate every placement in Grade {selectedDestinationGrade ?? "selected"}?</AlertTitle>
              <AlertDescription>Current placements and manual adjustments for this grade will be replaced. Placements in every other grade will remain unchanged. Click Generate Classes once to review, then confirm to proceed.</AlertDescription>
            </Alert>
          )}
          {placementMode === "full" && (
            <Alert variant="destructive" className="md:col-span-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Full generation changes all learner placements</AlertTitle>
              <AlertDescription>This preserves the original full-generation behavior and replaces placements across all destination grades. Click Generate Classes once to review, then confirm.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {accountContext?.subscriptionStatus === "trialing" && (
        <Alert variant={accountContext.trialExpired ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{accountContext.trialExpired ? "Trial expired" : "Trial access"}</AlertTitle>
          <AlertDescription>
            {accountContext.trialExpired
              ? "This workspace is read-only until you upgrade. You can still view existing data and solver results."
              : `${trialDaysRemaining ?? 0} day${trialDaysRemaining === 1 ? "" : "s"} remaining. ${trialUsesRemaining} of 3 trial solver generations remaining.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{students.length}</div>
            <p className="text-sm text-muted-foreground">Total Students</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{classConfigs.length}</div>
            <p className="text-sm text-muted-foreground">Target Classes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{rules.length}</div>
            <p className="text-sm text-muted-foreground">Rules Defined</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{characteristics.length}</div>
            <p className="text-sm text-muted-foreground">Characteristics</p>
          </CardContent>
        </Card>
      </div>

      {students.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No students</AlertTitle>
          <AlertDescription>
            You need to add students before generating classes. Go to the Students page to import or add students.
          </AlertDescription>
        </Alert>
      )}

      {classConfigs.length === 0 && placementCandidates.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No target classes defined</AlertTitle>
          <AlertDescription>
            Add at least one target class to generate placements.
          </AlertDescription>
        </Alert>
      )}

      {studentsWithoutTargetGrade.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>New Grade required</AlertTitle>
          <AlertDescription>
            {studentsWithoutTargetGrade.length} learner{studentsWithoutTargetGrade.length === 1 ? " is" : "s are"} missing a valid New Grade.
          </AlertDescription>
        </Alert>
      )}

      {studentsAwaitingAllocation.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Incoming Grade R learners awaiting allocation</AlertTitle>
          <AlertDescription>
            {studentsAwaitingAllocation.length} learner{studentsAwaitingAllocation.length === 1 ? " is" : "s are"} intentionally not included in class generation until a destination grade is assigned.
          </AlertDescription>
        </Alert>
      )}

      {gradeCapacityIssues.length > 0 && classConfigs.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Insufficient capacity</AlertTitle>
          <AlertDescription>
            {gradeCapacityIssues.map(({ grade, learnerCount, capacity }) =>
              `Grade ${grade} needs ${learnerCount} places but has capacity for ${capacity}`,
            ).join(". ")}. Please add target-grade classes or increase their capacity.
          </AlertDescription>
        </Alert>
      )}

      {canGenerate && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-800 dark:text-green-200">Ready to generate</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            All requirements met. Click "Generate Classes" to create balanced class placements.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Target Classes</h2>
        {classConfigs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No classes defined</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-4">
                Define the classes you want to create for student placement.
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-class">
                <Plus className="h-4 w-4 mr-2" />
                Add First Class
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {classConfigs.map((config) => {
              const gradeStudents = students.filter((s) => s.grade === config.grade);
              const fillPercentage = Math.min(
                100,
                (gradeStudents.length / classConfigs.filter((c) => c.grade === config.grade).length / (config.capacity || 30)) * 100
              );
              const assignedTeacher = teachers.find((t) => t.currentClass === config.name);
              return (
                <Card key={config.id} data-testid={`card-class-${config.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{config.name}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(config)}
                          data-testid={`button-edit-class-${config.id}`}
                          aria-label={`Edit ${config.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => deleteConfigMutation.mutate(config.id)}
                          data-testid={`button-delete-class-${config.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardDescription>
                      Grade {config.grade} • Capacity: {config.capacity}
                      {assignedTeacher ? ` • ${assignedTeacher.firstName} ${assignedTeacher.lastName}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Estimated fill</span>
                        <span>{Math.round(fillPercentage)}%</span>
                      </div>
                      <Progress value={fillPercentage} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {isGenerating && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <Sparkles className="h-12 w-12 text-primary animate-pulse" />
              </div>
              <h3 className="text-lg font-medium">Generating balanced classes...</h3>
              <p className="text-muted-foreground text-center max-w-sm">
                Our algorithm is working to create the most balanced class placements based on your rules and characteristics.
              </p>
              <Progress className="w-64" />
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Class</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Class Name *</Label>
              {teacherClasses.length > 0 && (
                <div className="space-y-2">
                  <Select
                    value={formData.name || ""}
                    onValueChange={(value) => {
                      if (value === "__custom__") {
                        setFormData({ ...formData, name: "" });
                      } else {
                        setFormData({ ...formData, name: value });
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-teacher-class">
                      <SelectValue placeholder="Select a teacher's class..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teacherClasses.map((tc) => (
                        <SelectItem key={tc.teacherId} value={tc.currentClass} data-testid={`option-class-${tc.teacherId}`}>
                          {tc.currentClass} ({tc.teacherName})
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__" data-testid="option-custom-class">
                        Enter custom name...
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select a teacher's current class or enter a custom name below
                  </p>
                </div>
              )}
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., 3A, Room 101"
                data-testid="input-class-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade">Grade *</Label>
              <Input
                id="grade"
                value={formData.grade}
                onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                placeholder="e.g., 3, K, 5"
                data-testid="input-class-grade"
              />
              {grades.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-xs text-muted-foreground mr-1">Quick select:</span>
                  {grades.map((g) => (
                    <Badge
                      key={g}
                      variant="outline"
                      className="cursor-pointer text-xs"
                      onClick={() => setFormData({ ...formData, grade: g })}
                    >
                      {g}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                max={50}
                value={formData.capacity ?? 30}
                onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                placeholder="30"
                data-testid="input-class-capacity"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createConfigMutation.isPending}
              data-testid="button-save-class"
            >
              {createConfigMutation.isPending ? "Saving..." : "Add Class"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingConfigId !== null} onOpenChange={(open) => { if (!open) setEditingConfigId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Class Name *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                data-testid="input-edit-class-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-grade">Grade *</Label>
              <Input
                id="edit-grade"
                value={editForm.grade}
                onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                data-testid="input-edit-class-grade"
              />
              {grades.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {grades.map((g) => (
                    <Badge
                      key={g}
                      variant="outline"
                      className="cursor-pointer text-xs"
                      onClick={() => setEditForm({ ...editForm, grade: g })}
                    >
                      {g}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Assigned Teacher</Label>
              <Select
                value={editForm.teacherId}
                onValueChange={(value) => setEditForm({ ...editForm, teacherId: value })}
              >
                <SelectTrigger data-testid="select-edit-class-teacher">
                  <SelectValue placeholder="Select a teacher..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.firstName} {teacher.lastName}
                      {teacher.currentClass && teacher.currentClass !== classConfigs.find((c) => c.id === editingConfigId)?.name
                        ? ` (currently ${teacher.currentClass})`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-capacity">Capacity</Label>
              <Input
                id="edit-capacity"
                type="number"
                min={1}
                max={50}
                value={editForm.capacity}
                onChange={(e) => setEditForm({ ...editForm, capacity: Number(e.target.value) })}
                data-testid="input-edit-class-capacity"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConfigId(null)} data-testid="button-edit-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={updateConfigMutation.isPending}
              data-testid="button-edit-save"
            >
              {updateConfigMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
