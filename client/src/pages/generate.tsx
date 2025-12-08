import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, Plus, Trash2, Users, AlertCircle, CheckCircle } from "lucide-react";
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
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClassConfig, InsertClassConfig, Student, Rule, Characteristic, Teacher } from "@shared/schema";

export default function GeneratePage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/generate-classes", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      setIsGenerating(false);
      toast({ title: "Classes generated successfully!" });
      setLocation("/review");
    },
    onError: () => {
      setIsGenerating(false);
      toast({ title: "Failed to generate classes", variant: "destructive" });
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
    setIsGenerating(true);
    generateMutation.mutate();
  };

  const grades = Array.from(new Set(students.map((s) => s.grade))).sort();
  const totalCapacity = classConfigs.reduce((sum, c) => sum + (c.capacity || 30), 0);
  const canGenerate = students.length > 0 && classConfigs.length > 0 && totalCapacity >= students.length;

  const isLoading = configsLoading || studentsLoading;

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
            Configure your target classes and generate balanced placements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-class">
            <Plus className="h-4 w-4 mr-2" />
            Add Class
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            data-testid="button-generate"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? "Generating..." : "Generate Classes"}
          </Button>
        </div>
      </div>

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

      {classConfigs.length === 0 && students.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No target classes defined</AlertTitle>
          <AlertDescription>
            Add at least one target class to generate placements.
          </AlertDescription>
        </Alert>
      )}

      {totalCapacity < students.length && classConfigs.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Insufficient capacity</AlertTitle>
          <AlertDescription>
            Total class capacity ({totalCapacity}) is less than the number of students ({students.length}). 
            Please add more classes or increase capacity.
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
              return (
                <Card key={config.id} data-testid={`card-class-${config.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{config.name}</CardTitle>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteConfigMutation.mutate(config.id)}
                        data-testid={`button-delete-class-${config.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardDescription>
                      Grade {config.grade} • Capacity: {config.capacity}
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
    </div>
  );
}
