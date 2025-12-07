import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Users, AlertTriangle, CheckCircle, ArrowRight, Download, 
  GripVertical, Link2, Unlink, BarChart3, RefreshCw, Zap,
  ArrowRightLeft, Check, X, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import type { 
  ClassConfig, Student, Placement, Rule, Characteristic, 
  ConflictWarning, BoostResponse, BoostSuggestion
} from "@shared/schema";

interface ClassWithStudents {
  config: ClassConfig;
  students: Student[];
  placements: Placement[];
}

export default function ReviewPage() {
  const { toast } = useToast();
  const [draggedStudent, setDraggedStudent] = useState<Student | null>(null);
  const [dragOverClass, setDragOverClass] = useState<string | null>(null);
  const [showBoostPanel, setShowBoostPanel] = useState(false);

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

  const moveMutation = useMutation({
    mutationFn: ({ studentId, targetClassId }: { studentId: string; targetClassId: string }) =>
      apiRequest("POST", "/api/placements/move", { studentId, targetClassId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      toast({ title: "Student moved successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to move student", 
        description: error?.message || "An error occurred",
        variant: "destructive" 
      });
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
      const classStudents = students.filter((s) => classPlacementIds.includes(s.id));
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

    return characteristics.map((char) => {
      const distribution = classesWithStudents.map(({ config, students: classStudents }) => {
        const values: Record<string, number> = {};
        classStudents.forEach((student) => {
          const charValue = (student.characteristics as Record<string, string>)?.[char.id] || "Unset";
          values[charValue] = (values[charValue] || 0) + 1;
        });
        return { className: config.name, values };
      });

      const allValues = new Set<string>();
      distribution.forEach((d) => Object.keys(d.values).forEach((v) => allValues.add(v)));

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
    
    const charNameToId: Record<string, string> = {};
    characteristics.forEach(char => {
      charNameToId[char.name] = char.id;
    });

    return classesWithStudents.map(({ config, students: classStudents }) => {
      const averages: Record<string, number | null> = {};
      percentageFieldNames.forEach(fieldName => {
        const charId = charNameToId[fieldName];
        const values = classStudents
          .map(s => {
            const chars = s.characteristics as Record<string, string>;
            const val = charId ? chars?.[charId] : chars?.[fieldName];
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

      return {
        classId: config.id,
        className: config.name,
        averages,
        maleCount,
        femaleCount,
        totalStudents: classStudents.length,
      };
    });
  }, [classesWithStudents, characteristics]);

  const handleDragStart = (student: Student) => {
    setDraggedStudent(student);
  };

  const handleDragOver = (e: React.DragEvent, classId: string) => {
    e.preventDefault();
    setDragOverClass(classId);
  };

  const handleDragLeave = () => {
    setDragOverClass(null);
  };

  const handleDrop = (e: React.DragEvent, targetClassId: string) => {
    e.preventDefault();
    setDragOverClass(null);
    if (draggedStudent) {
      moveMutation.mutate({ studentId: draggedStudent.id, targetClassId });
      setDraggedStudent(null);
    }
  };

  const isLoading = configsLoading || studentsLoading || placementsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (placements.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Review & Adjust</h1>
          <p className="text-muted-foreground mt-1">
            Review generated class placements and make manual adjustments
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No placements generated yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Generate class placements first, then come back here to review and fine-tune.
            </p>
            <Link href="/generate">
              <Button data-testid="button-go-to-generate">
                <ArrowRight className="h-4 w-4 mr-2" />
                Go to Generate Classes
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Review & Adjust</h1>
          <p className="text-muted-foreground mt-1">
            Drag and drop students between classes to fine-tune placements
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge 
            variant={conflicts.length === 0 ? "default" : "destructive"}
            className="gap-1"
          >
            {conflicts.length === 0 ? (
              <><CheckCircle className="h-3 w-3" /> No Conflicts</>
            ) : (
              <><AlertTriangle className="h-3 w-3" /> {conflicts.length} Conflict{conflicts.length !== 1 ? "s" : ""}</>
            )}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <BarChart3 className="h-3 w-3" />
            {overallBalance}% Balanced
          </Badge>
          <Button
            variant={showBoostPanel ? "default" : "outline"}
            size="sm"
            onClick={() => setShowBoostPanel(!showBoostPanel)}
            data-testid="button-toggle-boost"
          >
            <Zap className="h-4 w-4 mr-1" />
            Boost
          </Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="space-y-2">
          {conflicts.slice(0, 3).map((conflict, i) => (
            <Alert key={i} variant="destructive">
              {conflict.type === "pairing" ? (
                <Link2 className="h-4 w-4" />
              ) : conflict.type === "separation" ? (
                <Unlink className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertTitle className="capitalize">{conflict.type} Conflict</AlertTitle>
              <AlertDescription>{conflict.message}</AlertDescription>
            </Alert>
          ))}
          {conflicts.length > 3 && (
            <p className="text-sm text-muted-foreground">
              And {conflicts.length - 3} more conflict{conflicts.length - 3 !== 1 ? "s" : ""}...
            </p>
          )}
        </div>
      )}

      {showBoostPanel && (
        <Card data-testid="card-boost-panel">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-base">Boost Optimization</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetchBoost()}
                disabled={boostLoading}
                data-testid="button-refresh-boost"
              >
                <RefreshCw className={`h-4 w-4 ${boostLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <CardDescription>
              Intelligent suggestions to improve class balance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {boostLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Analyzing placements...</span>
              </div>
            ) : boostData?.suggestions && boostData.suggestions.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Found {boostData.suggestions.length} swap{boostData.suggestions.length !== 1 ? "s" : ""} that could improve balance
                </p>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {boostData.suggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="flex items-center gap-3 p-3 rounded-md bg-muted/50 group"
                        data-testid={`boost-suggestion-${suggestion.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium truncate">{suggestion.student1.name}</span>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {suggestion.student1.currentClass}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 my-1">
                            <ArrowRightLeft className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium truncate">{suggestion.student2.name}</span>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {suggestion.student2.currentClass}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="secondary" className="text-xs">
                            +{suggestion.improvement}%
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => applyBoostMutation.mutate(suggestion)}
                            disabled={applyBoostMutation.isPending}
                            data-testid={`button-apply-boost-${suggestion.id}`}
                          >
                            {applyBoostMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            Apply
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                <p className="text-sm font-medium">Already Optimized</p>
                <p className="text-xs text-muted-foreground">
                  No beneficial swaps found. Classes are well balanced.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {classesWithStudents.map(({ config, students: classStudents }) => (
              <Card
                key={config.id}
                className={`transition-colors ${
                  dragOverClass === config.id ? "ring-2 ring-primary border-primary" : ""
                }`}
                onDragOver={(e) => handleDragOver(e, config.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, config.id)}
                data-testid={`card-class-review-${config.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{config.name}</CardTitle>
                    <Badge variant={classStudents.length > (config.capacity || 30) ? "destructive" : "secondary"}>
                      {classStudents.length}/{config.capacity || 30}
                    </Badge>
                  </div>
                  <CardDescription>Grade {config.grade}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    <div className="space-y-1">
                      {classStudents.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Drop students here
                        </p>
                      ) : (
                        classStudents.map((student) => {
                          const hasConflict = conflicts.some((c) => c.studentIds.includes(student.id));
                          return (
                            <div
                              key={student.id}
                              draggable
                              onDragStart={() => handleDragStart(student)}
                              className={`flex items-center gap-2 p-2 rounded-md cursor-grab active:cursor-grabbing transition-colors ${
                                hasConflict 
                                  ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800" 
                                  : "bg-muted/50"
                              } ${draggedStudent?.id === student.id ? "opacity-50" : ""}`}
                              data-testid={`student-card-${student.id}`}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {student.firstName} {student.lastName}
                                </p>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {student.gender && (
                                    <Badge variant="outline" className="text-xs">
                                      {student.gender}
                                    </Badge>
                                  )}
                                  {Object.entries(student.characteristics || {})
                                    .slice(0, 2)
                                    .map(([key, value]) => (
                                      <Badge key={key} variant="secondary" className="text-xs">
                                        {value}
                                      </Badge>
                                    ))}
                                </div>
                              </div>
                              {hasConflict && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>This student is involved in a conflict</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ))}
          </div>

          {unplacedStudents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Unplaced Students ({unplacedStudents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {unplacedStudents.map((student) => (
                    <div
                      key={student.id}
                      draggable
                      onDragStart={() => handleDragStart(student)}
                      className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 cursor-grab active:cursor-grabbing"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {student.firstName} {student.lastName}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Balance Overview
              </CardTitle>
              <CardDescription>
                How evenly characteristics are distributed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Overall Balance</span>
                  <span className={overallBalance >= 80 ? "text-green-600" : overallBalance >= 60 ? "text-amber-600" : "text-red-600"}>
                    {overallBalance}%
                  </span>
                </div>
                <Progress 
                  value={overallBalance} 
                  className={`h-3 ${
                    overallBalance >= 80 
                      ? "[&>div]:bg-green-500" 
                      : overallBalance >= 60 
                      ? "[&>div]:bg-amber-500" 
                      : "[&>div]:bg-red-500"
                  }`}
                />
              </div>

              {balanceMetrics.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {balanceMetrics.map((metric) => (
                    <div key={metric.characteristicId} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{metric.name}</span>
                        <span>{metric.score}%</span>
                      </div>
                      <Progress value={metric.score} className="h-1.5" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add characteristics to see balance metrics
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Students</span>
                <span className="font-medium">{students.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Placed</span>
                <span className="font-medium">{placements.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Unplaced</span>
                <span className={`font-medium ${unplacedStudents.length > 0 ? "text-amber-600" : ""}`}>
                  {unplacedStudents.length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Classes</span>
                <span className="font-medium">{classConfigs.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Conflicts</span>
                <span className={`font-medium ${conflicts.length > 0 ? "text-red-600" : "text-green-600"}`}>
                  {conflicts.length}
                </span>
              </div>

              {classStatistics.length > 0 && placements.length > 0 && (
                <div className="pt-4 border-t space-y-4">
                  <p className="text-sm font-medium">Class Statistics</p>
                  {classStatistics.map((stat) => (
                    <div key={stat.classId} className="space-y-2" data-testid={`class-stats-${stat.classId}`}>
                      <p className="text-sm font-medium text-muted-foreground">{stat.className}</p>
                      <div className="pl-2 space-y-1 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Gender</span>
                          <span className="font-medium">{stat.maleCount} M / {stat.femaleCount} F</span>
                        </div>
                        {stat.averages["Aggregate %"] !== null && (
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Aggregate Avg</span>
                            <span className="font-medium">{stat.averages["Aggregate %"]}%</span>
                          </div>
                        )}
                        {stat.averages["Maths %"] !== null && (
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Maths Avg</span>
                            <span className="font-medium">{stat.averages["Maths %"]}%</span>
                          </div>
                        )}
                        {stat.averages["English %"] !== null && (
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">English Avg</span>
                            <span className="font-medium">{stat.averages["English %"]}%</span>
                          </div>
                        )}
                        {stat.averages["Afrikaans/Isizulu %"] !== null && (
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Afrikaans/Isizulu Avg</span>
                            <span className="font-medium">{stat.averages["Afrikaans/Isizulu %"]}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
