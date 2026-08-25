import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users, AlertTriangle, CheckCircle, ArrowRight, Download,
  GripVertical, Link2, Unlink, BarChart3, RefreshCw, Zap,
  ArrowRightLeft, Check, X, Loader2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { characteristicValueToArray, isCharacteristicApplicableToGrade } from "@shared/characteristics";
import type {
  ClassConfig, Student, Placement, Rule, Characteristic,
  ConflictWarning, BoostResponse, BoostSuggestion, Teacher
} from "@shared/schema";

interface ClassWithStudents {
  config: ClassConfig;
  students: Student[];
  placements: Placement[];
}

const isNumericCharacteristic = (char: Characteristic) => char.type === "scale" || char.type === "percentage";

const getStudentCharacteristicValue = (student: Student, char: Characteristic) =>
  ((student.characteristics || {}) as Record<string, string | string[]>)[char.name];

const parseCharacteristicNumber = (value: string | string[] | undefined) => {
  if (!value || Array.isArray(value)) return null;
  const parsed = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const getGenderTextClass = (gender?: string | null) => {
  const normalized = (gender || "").toLowerCase().trim();
  if (["female", "f", "girl"].includes(normalized)) return "text-rose-600 dark:text-rose-400";
  if (["male", "m", "boy"].includes(normalized)) return "text-blue-600 dark:text-blue-400";
  return "text-foreground";
};

export default function ReviewPage() {
  const { toast } = useToast();
  const [draggedStudent, setDraggedStudent] = useState<Student | null>(null);
  const [dragOverClass, setDragOverClass] = useState<string | null>(null);
  const [recentlyMovedStudentId, setRecentlyMovedStudentId] = useState<string | null>(null);
  const [showBoostPanel, setShowBoostPanel] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [hiddenCharacteristicIds, setHiddenCharacteristicIds] = useState<string[]>([]);

  const { data: classConfigs = [], isLoading: configsLoading } = useQuery<ClassConfig[]>({
    queryKey: ["/api/class-configs"],
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const { data: placements = [], isLoading: placementsLoading } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
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

  const classToTeacher = useMemo(() => {
    const mapping: Record<string, string> = {};
    teachers.forEach((teacher) => {
      if (teacher.currentClass) {
        mapping[teacher.currentClass] = `${teacher.firstName} ${teacher.lastName}`;
      }
    });
    return mapping;
  }, [teachers]);

  const moveMutation = useMutation({
    mutationFn: ({ studentId, targetClassId }: { studentId: string; targetClassId: string }) =>
      apiRequest("POST", "/api/placements/move", { studentId, targetClassId }),
    onMutate: async ({ studentId, targetClassId }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/placements"] });
      const previousPlacements = queryClient.getQueryData<Placement[]>(["/api/placements"]);
      queryClient.setQueryData<Placement[]>(["/api/placements"], (current = []) =>
        current.map((placement) =>
          placement.studentId === studentId ? { ...placement, classId: targetClassId } : placement,
        ),
      );
      setRecentlyMovedStudentId(studentId);
      window.setTimeout(() => setRecentlyMovedStudentId((current) => current === studentId ? null : current), 900);
      return { previousPlacements };
    },
    onSuccess: () => {
      toast({ title: "Student moved successfully" });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousPlacements) {
        queryClient.setQueryData(["/api/placements"], context.previousPlacements);
      }
      toast({
        title: "Failed to move student",
        description: error?.message || "An error occurred",
        variant: "destructive"
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
    },
  });

  const { data: boostData, isLoading: boostLoading, refetch: refetchBoost } = useQuery<BoostResponse>({
    queryKey: ["/api/boost"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/boost", {});
      return res.json() as Promise<BoostResponse>;
    },
    enabled: showBoostPanel,
  });

  const applyBoostMutation = useMutation({
    mutationFn: (suggestion: BoostSuggestion) =>
      apiRequest("POST", "/api/boost/apply", {
        student1Id: suggestion.student1.id,
        student1NewClassId: suggestion.student2.currentClassId,
        student2Id: suggestion.student2.id,
        student2NewClassId: suggestion.student1.currentClassId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boost"] });
      toast({ title: "Swap applied successfully" });
    },
    onError: () => {
      toast({ title: "Failed to apply swap", variant: "destructive" });
    },
  });

  const classesWithStudents: ClassWithStudents[] = useMemo(() => {
    return classConfigs.map((config) => {
      const classPlacementIds = placements
        .filter((p) => p.classId === config.id)
        .map((p) => p.studentId);
      const classStudents = students
        .filter((s) => classPlacementIds.includes(s.id))
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
      const classPlacements = placements.filter((p) => p.classId === config.id);
      return { config, students: classStudents, placements: classPlacements };
    });
  }, [classConfigs, placements, students]);

  const unplacedStudents = useMemo(() => {
    const placedIds = new Set(placements.map((p) => p.studentId));
    return students.filter((s) => !placedIds.has(s.id));
  }, [students, placements]);

  const conflicts: ConflictWarning[] = useMemo(() => {
    const warnings: ConflictWarning[] = [];
    
    rules.forEach((rule) => {
      const student1Placement = placements.find((p) => p.studentId === rule.studentId1);
      const student2Placement = placements.find((p) => p.studentId === rule.studentId2);
      
      if (student1Placement && student2Placement) {
        if (rule.type === "pair" && student1Placement.classId !== student2Placement.classId) {
          const s1 = students.find((s) => s.id === rule.studentId1);
          const s2 = students.find((s) => s.id === rule.studentId2);
          warnings.push({
            type: "pairing",
            message: `${s1?.firstName} ${s1?.lastName} and ${s2?.firstName} ${s2?.lastName} should be together`,
            studentIds: [rule.studentId1, rule.studentId2],
            ruleId: rule.id,
          });
        }
        if (rule.type === "separate" && student1Placement.classId === student2Placement.classId) {
          const s1 = students.find((s) => s.id === rule.studentId1);
          const s2 = students.find((s) => s.id === rule.studentId2);
          warnings.push({
            type: "separation",
            message: `${s1?.firstName} ${s1?.lastName} and ${s2?.firstName} ${s2?.lastName} should be apart`,
            studentIds: [rule.studentId1, rule.studentId2],
            ruleId: rule.id,
          });
        }
      }
    });

    classesWithStudents.forEach(({ config, students: classStudents }) => {
      if (classStudents.length > (config.capacity || 30)) {
        warnings.push({
          type: "capacity",
          message: `${config.name} exceeds capacity (${classStudents.length}/${config.capacity})`,
          studentIds: classStudents.map((s) => s.id),
        });
      }
    });

    return warnings;
  }, [rules, placements, students, classesWithStudents]);

  const balanceMetrics = useMemo(() => {
    if (characteristics.length === 0 || classesWithStudents.length === 0) return [];

    const activeCharacteristics = [...characteristics]
      .filter((char) => !char.tagOnly)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, 50);

    return activeCharacteristics.map((char) => {
      const distribution = classesWithStudents.map(({ config, students: classStudents }) => {
        const values: Record<string, number> = {};
        classStudents.forEach((student) => {
          if (!isCharacteristicApplicableToGrade(char, student.grade)) return;
          const rawValues = characteristicValueToArray(getStudentCharacteristicValue(student, char));
          if (rawValues.length === 0) {
            values.Unset = (values.Unset || 0) + 1;
            return;
          }
          rawValues.forEach((charValue) => {
            values[charValue] = (values[charValue] || 0) + 1;
          });
        });
        return { className: config.name, values };
      });

      if (isNumericCharacteristic(char)) {
        const allValues = students
          .filter((student) => isCharacteristicApplicableToGrade(char, student.grade))
          .map((student) => parseCharacteristicNumber(getStudentCharacteristicValue(student, char)))
          .filter((value): value is number => value !== null);
        if (allValues.length === 0) {
          return { characteristicId: char.id, name: char.name, distribution, score: 100 };
        }
        const targetAverage = allValues.reduce((sum, value) => sum + value, 0) / allValues.length;
        const range = Math.max(1, Math.max(...allValues) - Math.min(...allValues));
        const classScores = classesWithStudents.map(({ students: classStudents }) => {
          const values = classStudents
            .filter((student) => isCharacteristicApplicableToGrade(char, student.grade))
            .map((student) => parseCharacteristicNumber(getStudentCharacteristicValue(student, char)))
            .filter((value): value is number => value !== null);
          if (values.length === 0) return 100;
          const classAverage = values.reduce((sum, value) => sum + value, 0) / values.length;
          const deviation = Math.abs(classAverage - targetAverage) / range;
          return Math.max(0, 100 - Math.min(1, deviation) * 100);
        });
        return {
          characteristicId: char.id,
          name: char.name,
          distribution,
          score: Math.round(classScores.reduce((sum, score) => sum + score, 0) / classScores.length),
        };
      }

      const allValues = new Set<string>();
      distribution.forEach((d) => Object.keys(d.values).filter((value) => value !== "Unset").forEach((v) => allValues.add(v)));

      let totalVariance = 0;
      allValues.forEach((value) => {
        const counts = distribution.map((d) => d.values[value] || 0);
        const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
        totalVariance += variance;
      });

      const maxVariance = allValues.size * Math.pow(students.length / 2, 2);
      const score = maxVariance > 0 ? Math.max(0, 100 - (totalVariance / maxVariance) * 100) : 100;

      return {
        characteristicId: char.id,
        name: char.name,
        distribution,
        score: Math.round(score),
      };
    });
  }, [characteristics, classesWithStudents, students]);

  const overallBalance = useMemo(() => {
    if (balanceMetrics.length === 0) return 100;
    return Math.round(balanceMetrics.reduce((sum, m) => sum + m.score, 0) / balanceMetrics.length);
  }, [balanceMetrics]);

  const classStatistics = useMemo(() => {
    const percentageFieldNames = ["Aggregate %", "Maths %", "English %", "Afrikaans/Isizulu %"];
    const visibleCharacteristics = characteristics.filter((characteristic) => !characteristic.adminOnly);

    return classesWithStudents.map(({ config, students: classStudents }) => {
      const averages: Record<string, number | null> = {};
      percentageFieldNames.forEach(fieldName => {
        const values = classStudents
          .map(s => {
            const chars = s.characteristics as Record<string, string>;
            const val = chars?.[fieldName];
            return val ? parseFloat(val) : null;
          })
          .filter((v): v is number => v !== null && !isNaN(v));
        
        averages[fieldName] = values.length > 0
          ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length * 10) / 10
          : null;
      });

      const genderLower = (g?: string | null) => (g || '').toLowerCase().trim();
      const maleCount = classStudents.filter(s => {
        const g = genderLower(s.gender);
        return g === 'male' || g === 'm' || g === 'boy';
      }).length;
      const femaleCount = classStudents.filter(s => {
        const g = genderLower(s.gender);
        return g === 'female' || g === 'f' || g === 'girl';
      }).length;

      const characteristicStats = visibleCharacteristics.map((characteristic) => {
        const values = classStudents
          .filter((student) => isCharacteristicApplicableToGrade(characteristic, student.grade))
          .map((student) => (student.characteristics || {})[characteristic.name])
          .flatMap((value) => characteristicValueToArray(value as string | string[] | null | undefined));

        if (characteristic.type === "scale" || characteristic.type === "percentage") {
          const numericValues = values
            .map((value) => Number.parseFloat(value.replace("%", "").trim()))
            .filter((value) => Number.isFinite(value));
          return {
            id: characteristic.id,
            name: characteristic.name,
            value: numericValues.length > 0
              ? `${Math.round((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) * 10) / 10}`
              : "—",
          };
        }

        if (characteristic.type === "category") {
          const counts = new Map<string, number>();
          values.forEach((value) => {
            counts.set(value, (counts.get(value) || 0) + 1);
          });
          const summary = Array.from(counts.entries())
            .map(([value, count]) => `${value} (${count})`)
            .join(", ");
          return {
            id: characteristic.id,
            name: characteristic.name,
            value: summary || "—",
          };
        }

        return {
          id: characteristic.id,
          name: characteristic.name,
          value: values.length > 0 ? values.join(", ") : "—",
        };
      });

      return {
        classId: config.id,
        className: config.name,
        averages,
        maleCount,
        femaleCount,
        totalStudents: classStudents.length,
        characteristicStats,
      };
    });
  }, [classesWithStudents, characteristics]);

  const availableGrades = useMemo(
    () => Array.from(new Set(classConfigs.map((config) => config.grade))).sort(),
    [classConfigs],
  );
  const visibleClassesWithStudents = selectedGrade === "all"
    ? classesWithStudents
    : classesWithStudents.filter(({ config }) => config.grade === selectedGrade);
  const visibleBalanceMetrics = balanceMetrics.filter(
    (metric) => !hiddenCharacteristicIds.includes(metric.characteristicId),
  );
  const pairRequestCount = rules.filter((rule) => rule.type === "pair").length;
  const separateRequestCount = rules.filter((rule) => rule.type === "separate").length;

  const handleDragStart = (event: React.DragEvent, student: Student) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", student.id);
    setDraggedStudent(student);
  };

  const handleDragOver = (e: React.DragEvent, classId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverClass(classId);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragOverClass(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetClassId: string) => {
    e.preventDefault();
    setDragOverClass(null);
    if (draggedStudent) {
      const currentPlacement = placements.find((placement) => placement.studentId === draggedStudent.id);
      if (currentPlacement?.classId !== targetClassId) {
        moveMutation.mutate({ studentId: draggedStudent.id, targetClassId });
      }
      setDraggedStudent(null);
    }
  };

  const isLoading = configsLoading || studentsLoading || placementsLoading;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
          <Skeleton className="h-[640px] w-full" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[640px] w-full" />)}
          </div>
        </div>
      </div>
    );
  }

  if (placements.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Solver</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Review and adjust balanced class placements</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 rounded-full bg-muted p-3"><Users className="h-7 w-7 text-muted-foreground" /></div>
            <h3 className="mb-1 text-base font-medium">No placements generated yet</h3>
            <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">Generate class placements first, then come back here to review and fine-tune.</p>
            <Link href="/generate"><Button size="sm" data-testid="button-go-to-generate"><ArrowRight className="mr-2 h-4 w-4" />Go to Generate Classes</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Solver</h1>
          <p className="text-xs text-muted-foreground">Review & Adjust · Drag students between class columns</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={conflicts.length === 0 ? "default" : "destructive"} className="h-7 gap-1 text-xs">
            {conflicts.length === 0 ? <><CheckCircle className="h-3.5 w-3.5" /> No conflicts</> : <><AlertTriangle className="h-3.5 w-3.5" /> {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}</>}
          </Badge>
          <Badge variant="outline" className="h-7 gap-1 text-xs"><BarChart3 className="h-3.5 w-3.5" /> {overallBalance}% balance</Badge>
          <Button variant={showBoostPanel ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onClick={() => setShowBoostPanel(!showBoostPanel)} data-testid="button-toggle-boost"><Zap className="mr-1 h-3.5 w-3.5" /> Boost</Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">Conflicts need attention</AlertTitle>
          <AlertDescription className="text-xs">
            {conflicts.slice(0, 3).map((conflict) => conflict.message).join(" · ")}
            {conflicts.length > 3 ? ` · +${conflicts.length - 3} more` : ""}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-[76px]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/30 px-3 py-2.5">
              <CardTitle className="text-sm">Solver overview</CardTitle>
              <CardDescription className="text-[11px]">Live placement statistics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grade</label>
                <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-solver-grade"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All grades</SelectItem>
                    {availableGrades.map((grade) => <SelectItem key={grade} value={grade}>Grade {grade}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 overflow-hidden rounded-md border text-xs">
                <div className="border-b border-r p-2"><div className="text-[10px] text-muted-foreground">Students</div><div className="text-lg font-semibold leading-5">{students.length}</div></div>
                <div className="border-b p-2"><div className="text-[10px] text-muted-foreground">Placed</div><div className="text-lg font-semibold leading-5">{placements.length}</div></div>
                <div className="border-r p-2"><div className="text-[10px] text-muted-foreground">Classes</div><div className="text-lg font-semibold leading-5">{classConfigs.length}</div></div>
                <div className="p-2"><div className="text-[10px] text-muted-foreground">Conflicts</div><div className={`text-lg font-semibold leading-5 ${conflicts.length ? "text-red-600" : "text-emerald-600"}`}>{conflicts.length}</div></div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Students placed</span><span className="font-medium">{placements.length}/{students.length}</span></div>
                <Progress value={students.length ? (placements.length / students.length) * 100 : 0} className="h-1.5" />
                <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Overall balance</span><span className="font-semibold">{overallBalance}%</span></div>
                <Progress value={overallBalance} className={`h-1.5 ${overallBalance >= 80 ? "[&>div]:bg-emerald-500" : overallBalance >= 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`} />
              </div>

              <div className="border-t pt-2.5">
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Requests</span><span>{rules.length} total</span></div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="rounded border px-2 py-1.5"><Link2 className="mr-1 inline h-3 w-3" />Together <b className="float-right">{pairRequestCount}</b></div>
                  <div className="rounded border px-2 py-1.5"><Unlink className="mr-1 inline h-3 w-3" />Apart <b className="float-right">{separateRequestCount}</b></div>
                </div>
              </div>

              <div className="border-t pt-2.5">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Characteristic balance</span><span>{visibleBalanceMetrics.length}/{balanceMetrics.length}</span></div>
                {balanceMetrics.length > 0 ? (
                  <ScrollArea className="h-[190px] pr-2">
                    <div className="space-y-2">
                      {balanceMetrics.map((metric) => {
                        const isVisible = !hiddenCharacteristicIds.includes(metric.characteristicId);
                        return (
                          <div key={metric.characteristicId} className={isVisible ? "space-y-1" : "space-y-1 opacity-50"}>
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <Checkbox className="h-3.5 w-3.5" checked={isVisible} onCheckedChange={(checked) => setHiddenCharacteristicIds((current) => checked ? current.filter((id) => id !== metric.characteristicId) : [...current, metric.characteristicId])} aria-label={`Show ${metric.name} balance`} />
                              <span className="min-w-0 flex-1 truncate">{metric.name}</span><span className="font-medium">{metric.score}%</span>
                            </div>
                            {isVisible && <Progress value={metric.score} className="h-1" />}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : <p className="text-[11px] text-muted-foreground">No balancing characteristics configured.</p>}
              </div>

              {classStatistics.length > 0 && (
                <div className="border-t pt-2.5">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Class balance</div>
                  <div className="space-y-1.5">
                    {classStatistics.filter((stat) => visibleClassesWithStudents.some(({ config }) => config.id === stat.classId)).map((stat) => (
                      <div key={stat.classId} className="rounded border px-2 py-1.5 text-[11px]" data-testid={`class-stats-${stat.classId}`}>
                        <div className="flex justify-between font-medium"><span className="truncate">{stat.className}</span><span>{stat.totalStudents}</span></div>
                        <div className="mt-0.5 flex justify-between text-muted-foreground"><span><span className="text-blue-600">{stat.maleCount} boys</span> · <span className="text-rose-600">{stat.femaleCount} girls</span></span>{stat.averages["Aggregate %"] !== null && <span>{stat.averages["Aggregate %"]}% avg</span>}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0 space-y-3">
          {showBoostPanel && (
            <Card data-testid="card-boost-panel">
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b px-3 py-2">
                <div><CardTitle className="text-sm"><Zap className="mr-1.5 inline h-4 w-4 text-amber-500" />Boost optimization</CardTitle><CardDescription className="text-[11px]">Suggested swaps to improve balance</CardDescription></div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetchBoost()} disabled={boostLoading} data-testid="button-refresh-boost"><RefreshCw className={`h-3.5 w-3.5 ${boostLoading ? "animate-spin" : ""}`} /></Button>
              </CardHeader>
              <CardContent className="p-2">
                {boostLoading ? <div className="flex items-center justify-center py-5 text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing placements...</div> : boostData?.suggestions?.length ? (
                  <ScrollArea className="h-40"><div className="grid gap-1.5 xl:grid-cols-2">
                    {boostData.suggestions.map((suggestion) => (
                      <div key={suggestion.id} className="flex items-center gap-2 rounded border bg-muted/30 p-2 text-xs" data-testid={`boost-suggestion-${suggestion.id}`}>
                        <div className="min-w-0 flex-1"><span className="font-medium">{suggestion.student1.name}</span><ArrowRightLeft className="mx-1 inline h-3 w-3 text-muted-foreground" /><span className="font-medium">{suggestion.student2.name}</span><div className="truncate text-[10px] text-muted-foreground">{suggestion.student1.currentClass} ↔ {suggestion.student2.currentClass}</div></div>
                        <Badge variant="secondary" className="text-[10px]">+{suggestion.improvement}%</Badge>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => applyBoostMutation.mutate(suggestion)} disabled={applyBoostMutation.isPending} data-testid={`button-apply-boost-${suggestion.id}`}><Check className="mr-1 h-3 w-3" />Apply</Button>
                      </div>
                    ))}
                  </div></ScrollArea>
                ) : <div className="flex items-center justify-center py-5 text-xs text-muted-foreground"><CheckCircle className="mr-2 h-4 w-4 text-emerald-500" />No beneficial swaps found.</div>}
              </CardContent>
            </Card>
          )}

          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-full grid-flow-col auto-cols-[minmax(215px,1fr)] gap-2.5">
              {visibleClassesWithStudents.map(({ config, students: classStudents }) => {
                const teacherName = classToTeacher[config.name];
                return (
                  <Card key={config.id} className={`overflow-hidden transition-colors ${dragOverClass === config.id ? "ring-2 ring-primary border-primary" : ""}`} onDragOver={(event) => handleDragOver(event, config.id)} onDragLeave={handleDragLeave} onDrop={(event) => handleDrop(event, config.id)} data-testid={`card-class-review-${config.id}`}>
                    <CardHeader className="border-b bg-muted/35 px-2.5 py-2">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0"><CardTitle className="truncate text-xs font-semibold" data-testid={`text-class-name-${config.id}`}>{config.name}</CardTitle><CardDescription className="truncate text-[10px]">{teacherName || "No teacher assigned"} · Grade {config.grade}</CardDescription></div>
                        <Badge variant={classStudents.length > (config.capacity || 30) ? "destructive" : "secondary"} className="h-5 shrink-0 px-1.5 text-[10px]">{classStudents.length}/{config.capacity || 30}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-1.5">
                      <div className="space-y-0.5">
                        {dragOverClass === config.id && draggedStudent && <div className="mb-1 rounded border border-dashed border-primary bg-primary/10 px-1.5 py-1 text-center text-[10px] font-medium text-primary">Drop {draggedStudent.firstName} here</div>}
                        {classStudents.length === 0 ? <p className="py-6 text-center text-[11px] text-muted-foreground">Drop students here</p> : classStudents.map((student) => {
                          const hasConflict = conflicts.some((conflict) => conflict.studentIds.includes(student.id));
                          return (
                            <motion.div key={student.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}>
                              <div draggable onDragStart={(event) => handleDragStart(event, student)} onDragEnd={() => { setDraggedStudent(null); setDragOverClass(null); }} className={`group flex h-7 items-center gap-1 rounded px-1 text-[11px] transition-colors hover:bg-muted cursor-grab active:cursor-grabbing ${hasConflict ? "border border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30" : "border border-transparent odd:bg-muted/35"} ${draggedStudent?.id === student.id ? "opacity-40 ring-1 ring-primary" : ""} ${recentlyMovedStudentId === student.id ? "bg-primary/15 ring-1 ring-primary/50" : ""}`} data-testid={`student-card-${student.id}`}>
                                <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                                <span className={`min-w-0 flex-1 truncate font-medium ${getGenderTextClass(student.gender)}`}>{student.lastName}, {student.firstName}</span>
                                {hasConflict && <Tooltip><TooltipTrigger asChild><AlertTriangle className="h-3 w-3 shrink-0 text-red-500" /></TooltipTrigger><TooltipContent><p>This student is involved in a conflict</p></TooltipContent></Tooltip>}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {unplacedStudents.length > 0 && (
            <Card className="border-amber-300">
              <CardHeader className="border-b px-3 py-2"><CardTitle className="text-xs"><AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 text-amber-500" />Unplaced students ({unplacedStudents.length})</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-1 p-2">
                {unplacedStudents.map((student) => (
                  <motion.div key={student.id} layout><div draggable onDragStart={(event) => handleDragStart(event, student)} onDragEnd={() => { setDraggedStudent(null); setDragOverClass(null); }} className="flex h-7 cursor-grab items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 text-[11px] active:cursor-grabbing dark:border-amber-900 dark:bg-amber-950/30"><GripVertical className="h-3 w-3 text-muted-foreground" /><span className={`font-medium ${getGenderTextClass(student.gender)}`}>{student.lastName}, {student.firstName}</span></div></motion.div>
                ))}
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
