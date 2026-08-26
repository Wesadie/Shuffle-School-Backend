import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users, AlertTriangle, CheckCircle, ArrowRight, Download,
  GripVertical, Link2, Unlink, BarChart3, RefreshCw, Zap,
  ArrowRightLeft, Check, Loader2, Undo2
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
import { downloadXlsx, type SpreadsheetCell, type SpreadsheetSheet } from "@/lib/xlsx-export";
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

type PlacementSnapshot = Array<Pick<Placement, "studentId" | "classId">>;

type ColourLegendItem = {
  value: string;
  count: number;
  colour: string;
};

const CHARACTERISTIC_COLOURS = [
  "#2563eb", "#dc2626", "#0891b2", "#16a34a", "#a16207",
  "#7c3aed", "#db2777", "#0d9488", "#ea580c", "#475569",
];

const PERCENTAGE_BUCKET_ORDER = ["Below 50%", "50–59%", "60–69%", "70–79%", "80%+"];

const isNumericCharacteristic = (char: Characteristic) => char.type === "scale" || char.type === "percentage";

const getStudentCharacteristicValue = (student: Student, char: Characteristic) =>
  ((student.characteristics || {}) as Record<string, string | string[]>)[char.name];

const parseCharacteristicNumber = (value: string | string[] | undefined) => {
  if (!value || Array.isArray(value)) return null;
  const parsed = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const getCharacteristicColourValues = (student: Student, characteristic: Characteristic | null, useGender: boolean) => {
  if (useGender) return [student.gender?.trim() || "Unset"];
  if (!characteristic) return [];
  const values = characteristicValueToArray(getStudentCharacteristicValue(student, characteristic));
  if (values.length === 0) return ["Unset"];
  if (characteristic.type !== "percentage") return values;
  return values.map((value) => {
    const numericValue = Number.parseFloat(value.replace("%", "").trim());
    if (!Number.isFinite(numericValue)) return value;
    if (numericValue < 50) return "Below 50%";
    if (numericValue < 60) return "50–59%";
    if (numericValue < 70) return "60–69%";
    if (numericValue < 80) return "70–79%";
    return "80%+";
  });
};

const getExportCharacteristic = (student: Student, aliases: string[]) => {
  const entries = Object.entries(student.characteristics || {});
  const match = entries.find(([name]) => aliases.some((alias) => name.toLowerCase() === alias.toLowerCase()));
  if (!match) return "";
  return Array.isArray(match[1]) ? match[1].join(", ") : match[1];
};

const getGenderTextClass = (gender?: string | null) => {
  const normalized = (gender || "").toLowerCase().trim();
  if (["female", "f", "girl"].includes(normalized)) return "text-rose-600 dark:text-rose-400";
  if (["male", "m", "boy"].includes(normalized)) return "text-blue-600 dark:text-blue-400";
  return "text-foreground";
};

type CharacteristicCohortTarget = { average: number; range: number; shares: Map<string, number> };

const getCharacteristicCohortTarget = (students: Student[], char: Characteristic): CharacteristicCohortTarget | null => {
  if (isNumericCharacteristic(char)) {
    const values = students
      .filter((student) => isCharacteristicApplicableToGrade(char, student.grade))
      .map((student) => parseCharacteristicNumber(getStudentCharacteristicValue(student, char)))
      .filter((value): value is number => value !== null);
    if (values.length === 0) return null;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { average, range: Math.max(1, Math.max(...values) - Math.min(...values)), shares: new Map() };
  }
  const counts = new Map<string, number>();
  let total = 0;
  students.forEach((student) => {
    if (!isCharacteristicApplicableToGrade(char, student.grade)) return;
    const values = characteristicValueToArray(getStudentCharacteristicValue(student, char));
    if (values.length === 0) {
      counts.set("Unset", (counts.get("Unset") || 0) + 1);
      total += 1;
      return;
    }
    values.forEach((value) => {
      counts.set(value, (counts.get(value) || 0) + 1);
      total += 1;
    });
  });
  if (total === 0) return null;
  const shares = new Map<string, number>();
  counts.forEach((count, value) => shares.set(value, count / total));
  return { average: 0, range: 0, shares };
};

// Mirrors the server's calculateCharacteristicScore so client-side boostability
// checks agree with /api/boost suggestions.
const computeCharacteristicClassScore = (
  classStudents: Student[],
  char: Characteristic,
  target: CharacteristicCohortTarget | null,
): number => {
  if (classStudents.length === 0) return 100;

  if (isNumericCharacteristic(char)) {
    const values = classStudents
      .filter((student) => isCharacteristicApplicableToGrade(char, student.grade))
      .map((student) => parseCharacteristicNumber(getStudentCharacteristicValue(student, char)))
      .filter((value): value is number => value !== null);
    if (!target || values.length === 0) return 100;
    const classAverage = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.abs(classAverage - target.average) / target.range;
    return Math.max(0, Math.round(100 - Math.min(1, deviation) * 100));
  }

  if (!target || target.shares.size === 0) return 100;
  const distribution: Record<string, number> = {};
  let classTotal = 0;
  classStudents.forEach((student) => {
    if (!isCharacteristicApplicableToGrade(char, student.grade)) return;
    const values = characteristicValueToArray(getStudentCharacteristicValue(student, char));
    if (values.length === 0) {
      distribution.Unset = (distribution.Unset || 0) + 1;
      classTotal += 1;
      return;
    }
    values.forEach((value) => {
      distribution[value] = (distribution[value] || 0) + 1;
      classTotal += 1;
    });
  });
  if (classTotal === 0) return 100;

  const valueNames = new Set<string>([...Object.keys(distribution), ...target.shares.keys()]);
  let deviation = 0;
  valueNames.forEach((value) => {
    deviation += Math.abs((distribution[value] || 0) / classTotal - (target.shares.get(value) || 0));
  });
  return Math.max(0, Math.round(100 - (deviation / 2) * 100));
};

export default function ReviewPage() {
  const { toast } = useToast();
  const [draggedStudent, setDraggedStudent] = useState<Student | null>(null);
  const [dragOverClass, setDragOverClass] = useState<string | null>(null);
  const [recentlyMovedStudentId, setRecentlyMovedStudentId] = useState<string | null>(null);
  const [showBoostPanel, setShowBoostPanel] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [selectedColourCharacteristic, setSelectedColourCharacteristic] = useState("none");
  const [hiddenCharacteristicIds, setHiddenCharacteristicIds] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<PlacementSnapshot[]>([]);

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
    mutationFn: ({ studentId, targetClassId }: { studentId: string; targetClassId: string; historySnapshot?: PlacementSnapshot }) =>
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
    onSuccess: (_data, variables) => {
      if (variables.historySnapshot) {
        setUndoStack((current) => [...current, variables.historySnapshot!].slice(-20));
      }
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
    mutationFn: ({ suggestion }: { suggestion: BoostSuggestion; historySnapshot?: PlacementSnapshot }) =>
      apiRequest("POST", "/api/boost/apply", {
        student1Id: suggestion.student1.id,
        student1NewClassId: suggestion.student2.currentClassId,
        student2Id: suggestion.student2.id,
        student2NewClassId: suggestion.student1.currentClassId,
      }),
    onSuccess: (_data, variables) => {
      if (variables.historySnapshot) {
        setUndoStack((current) => [...current, variables.historySnapshot!].slice(-20));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boost"] });
      toast({ title: "Swap applied successfully" });
    },
    onError: () => {
      toast({ title: "Failed to apply swap", variant: "destructive" });
    },
  });

  // Boost a single characteristic: fetch the best swap for that characteristic
  // from /api/boost (characteristicId filter) and apply it via /api/boost/apply.
  const characteristicBoostMutation = useMutation({
    mutationFn: ({ characteristicId }: { characteristicId: string; name: string; historySnapshot: PlacementSnapshot }) =>
      (async () => {
        const res = await apiRequest("POST", "/api/boost", { characteristicId });
        const data = await res.json() as BoostResponse;
        const best = data.suggestions[0];
        if (!best) throw new Error("No improving swap found for this characteristic");
        await apiRequest("POST", "/api/boost/apply", {
          student1Id: best.student1.id,
          student1NewClassId: best.student2.currentClassId,
          student2Id: best.student2.id,
          student2NewClassId: best.student1.currentClassId,
        });
      })(),
    onSuccess: (_data, variables) => {
      setUndoStack((current) => [...current, variables.historySnapshot].slice(-20));
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boost"] });
      toast({ title: `${variables.name} boosted`, description: "Best balancing swap applied." });
    },
    onError: (error: Error) => {
      toast({ title: "Boost failed", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/generate-classes", {}),
    onSuccess: () => {
      setUndoStack([]);
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boost"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Solver re-run complete",
        description: "Class placements replaced with a new solution.",
      });
    },
    onError: (error: Error) => {
      const message = error.message || "";
      const isLimit = message.includes("TRIAL_SOLVER_LIMIT_REACHED");
      const isExpired = message.includes("TRIAL_EXPIRED");
      toast({
        title: isLimit ? "Trial solver limit reached" : isExpired ? "Trial expired" : "Failed to re-run solver",
        description: isLimit
          ? "You have used all 3 trial generations. Upgrade to generate more class lists."
          : isExpired
            ? "This workspace is now read-only until you upgrade."
            : message || undefined,
        variant: "destructive",
      });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (snapshot: PlacementSnapshot) => {
      const current = queryClient.getQueryData<Placement[]>(["/api/placements"]) ?? [];
      let restoredCount = 0;
      for (const entry of snapshot) {
        const placement = current.find((p) => p.studentId === entry.studentId);
        if (placement && placement.classId !== entry.classId) {
          await apiRequest("POST", "/api/placements/move", {
            studentId: entry.studentId,
            targetClassId: entry.classId,
          });
          restoredCount += 1;
        }
      }
      return restoredCount;
    },
    onMutate: async (snapshot) => {
      await queryClient.cancelQueries({ queryKey: ["/api/placements"] });
      const previousPlacements = queryClient.getQueryData<Placement[]>(["/api/placements"]);
      queryClient.setQueryData<Placement[]>(["/api/placements"], (current = []) =>
        current.map((placement) => {
          const entry = snapshot.find((s) => s.studentId === placement.studentId);
          return entry && entry.classId !== placement.classId ? { ...placement, classId: entry.classId } : placement;
        }),
      );
      return { previousPlacements };
    },
    onSuccess: (restoredCount) => {
      toast({
        title: restoredCount > 0 ? "Change undone" : "Nothing to restore",
        description: restoredCount > 0
          ? `${restoredCount} placement${restoredCount === 1 ? "" : "s"} restored.`
          : undefined,
      });
    },
    onError: (error: any, snapshot, context) => {
      if (context?.previousPlacements) {
        queryClient.setQueryData(["/api/placements"], context.previousPlacements);
      }
      setUndoStack((current) => [...current, snapshot].slice(-20));
      toast({ title: "Failed to undo", description: error?.message || "An error occurred", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
    },
  });

  const handleUndo = () => {
    if (undoStack.length === 0 || undoMutation.isPending) return;
    const lastSnapshot = undoStack[undoStack.length - 1];
    undoMutation.mutate(lastSnapshot);
    setUndoStack((current) => current.slice(0, -1));
  };

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

      // Category characteristics: compare each class's distribution with the
      // overall learner distribution (cohort shares), not variance within a class,
      // so a class holding a single value can no longer score 100%.
      const overallCounts: Record<string, number> = {};
      let overallTotal = 0;
      students.forEach((student) => {
        if (!isCharacteristicApplicableToGrade(char, student.grade)) return;
        const values = characteristicValueToArray(getStudentCharacteristicValue(student, char));
        if (values.length === 0) {
          overallCounts.Unset = (overallCounts.Unset || 0) + 1;
          overallTotal += 1;
          return;
        }
        values.forEach((value) => {
          overallCounts[value] = (overallCounts[value] || 0) + 1;
          overallTotal += 1;
        });
      });

      const classScores = distribution
        .filter((d) => Object.values(d.values).reduce((sum, count) => sum + count, 0) > 0)
        .map((d) => {
          const classTotal = Object.values(d.values).reduce((sum, count) => sum + count, 0);
          const valueNames = new Set<string>([...Object.keys(d.values), ...Object.keys(overallCounts)]);
          let deviation = 0;
          valueNames.forEach((value) => {
            deviation += Math.abs((d.values[value] || 0) / classTotal - (overallCounts[value] || 0) / overallTotal);
          });
          return Math.max(0, 100 - (deviation / 2) * 100);
        });

      const score = classScores.length === 0
        ? 100
        : classScores.reduce((sum, classScore) => sum + classScore, 0) / classScores.length;

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

  // Best possible single-characteristic swap improvement for each active
  // characteristic, mirroring /api/boost's swap search and 0.5% threshold so
  // the per-row boost icons reflect what the server can actually suggest.
  const characteristicBoostImprovements = useMemo(() => {
    const improvements = new Map<string, number>();
    const activeCharacteristics = [...characteristics]
      .filter((char) => !char.tagOnly)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, 50);
    if (activeCharacteristics.length === 0 || classesWithStudents.length < 2) return improvements;

    const separations = new Map<string, Set<string>>();
    const pairings = new Map<string, Set<string>>();
    rules.forEach((rule) => {
      const map = rule.type === "separate" ? separations : rule.type === "pair" ? pairings : null;
      if (!map) return;
      if (!map.has(rule.studentId1)) map.set(rule.studentId1, new Set());
      if (!map.has(rule.studentId2)) map.set(rule.studentId2, new Set());
      map.get(rule.studentId1)!.add(rule.studentId2);
      map.get(rule.studentId2)!.add(rule.studentId1);
    });

    const classOfStudent = new Map<string, string>();
    classesWithStudents.forEach(({ config, students: classStudents }) => {
      classStudents.forEach((student) => classOfStudent.set(student.id, config.id));
    });

    const violatesRules = (student: Student, targetClassId: string): boolean => {
      const targetStudents = classesWithStudents.find((c) => c.config.id === targetClassId)?.students ?? [];
      const mustSeparate = separations.get(student.id);
      if (mustSeparate) {
        for (const other of targetStudents) {
          if (mustSeparate.has(other.id)) return true;
        }
      }
      const mustPair = pairings.get(student.id);
      if (mustPair) {
        const currentClassId = classOfStudent.get(student.id);
        if (currentClassId) {
          const currentStudents = classesWithStudents.find((c) => c.config.id === currentClassId)?.students ?? [];
          for (const partnerId of mustPair) {
            if (currentStudents.some((s) => s.id === partnerId) && !targetStudents.some((s) => s.id === partnerId)) {
              return true;
            }
          }
        }
      }
      return false;
    };

    const classCount = classesWithStudents.length;
    for (const char of activeCharacteristics) {
      const target = getCharacteristicCohortTarget(students, char);
      const currentScores = classesWithStudents.map(({ students: classStudents }) =>
        computeCharacteristicClassScore(classStudents, char, target),
      );
      let best = 0;
      scan: for (let i = 0; i < classesWithStudents.length; i++) {
        for (let j = i + 1; j < classesWithStudents.length; j++) {
          const class1Students = classesWithStudents[i].students;
          const class2Students = classesWithStudents[j].students;
          const class1Id = classesWithStudents[i].config.id;
          const class2Id = classesWithStudents[j].config.id;
          for (const student1 of class1Students) {
            for (const student2 of class2Students) {
              if (violatesRules(student1, class2Id) || violatesRules(student2, class1Id)) continue;
              const newClass1 = class1Students.filter((s) => s.id !== student1.id).concat([student2]);
              const newClass2 = class2Students.filter((s) => s.id !== student2.id).concat([student1]);
              const gain = (computeCharacteristicClassScore(newClass1, char, target)
                + computeCharacteristicClassScore(newClass2, char, target))
                - (currentScores[i] + currentScores[j]);
              const improvement = gain / classCount;
              if (improvement > best) best = improvement;
              if (best > 0.5) break scan;
            }
          }
        }
      }
      improvements.set(char.id, best);
    }
    return improvements;
  }, [characteristics, classesWithStudents, rules, students]);

  const isCharacteristicBoostable = (characteristicId: string) =>
    (characteristicBoostImprovements.get(characteristicId) ?? 0) > 0.5;

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

  const colourableCharacteristics = useMemo(
    () => characteristics.filter((characteristic) => !characteristic.adminOnly),
    [characteristics],
  );
  const colourCharacteristic = colourableCharacteristics.find((c) => c.id === selectedColourCharacteristic) ?? null;

  const colourLegend: ColourLegendItem[] = useMemo(() => {
    if (!colourCharacteristic) return [];
    const counts = new Map<string, number>();
    if (colourCharacteristic.type === "category") {
      (colourCharacteristic.options || []).forEach((option) => counts.set(option, 0));
    }
    if (colourCharacteristic.type === "percentage") {
      PERCENTAGE_BUCKET_ORDER.forEach((bucket) => counts.set(bucket, 0));
    }
    students.forEach((student) => {
      getCharacteristicColourValues(student, colourCharacteristic, false).forEach((value) => {
        counts.set(value, (counts.get(value) || 0) + 1);
      });
    });
    const isPercentage = colourCharacteristic.type === "percentage";
    return Array.from(counts.entries())
      .sort((a, b) => {
        if ((a[0] === "Unset") !== (b[0] === "Unset")) return a[0] === "Unset" ? 1 : -1;
        if (isPercentage) {
          const aIndex = PERCENTAGE_BUCKET_ORDER.indexOf(a[0]);
          const bIndex = PERCENTAGE_BUCKET_ORDER.indexOf(b[0]);
          return (aIndex === -1 ? PERCENTAGE_BUCKET_ORDER.length : aIndex)
            - (bIndex === -1 ? PERCENTAGE_BUCKET_ORDER.length : bIndex);
        }
        return b[1] - a[1] || a[0].localeCompare(b[0]);
      })
      .map(([value, count], index) => ({
        value,
        count,
        colour: CHARACTERISTIC_COLOURS[index % CHARACTERISTIC_COLOURS.length],
      }));
  }, [students, colourCharacteristic]);

  const characteristicColourLookup = useMemo(
    () => new Map(colourLegend.map((item) => [item.value, item.colour])),
    [colourLegend],
  );

  const getStudentColour = (student: Student): string | null => {
    if (!colourCharacteristic) return null;
    const value = getCharacteristicColourValues(student, colourCharacteristic, false)[0];
    return value ? characteristicColourLookup.get(value) ?? null : null;
  };

  const getClassColourCounts = (classStudents: Student[]): ColourLegendItem[] => {
    if (!colourCharacteristic) return [];
    const counts = new Map<string, number>();
    classStudents.forEach((student) => {
      getCharacteristicColourValues(student, colourCharacteristic, false).forEach((value) => {
        counts.set(value, (counts.get(value) || 0) + 1);
      });
    });
    return colourLegend.map((item) => ({ ...item, count: counts.get(item.value) || 0 }));
  };

  const handleExportClasses = () => {
    const exportHeader = ["Class", "Grade", "Teacher", "First name", "Surname", "Student ID", "Gender", "Aggregate", "English %", "Maths %", "2nd Language %", "2nd Language choice", "Medication", "Learner Support", "Race"];
    const summaryHeader = ["Class", "Teacher", "Grade", "Learners", "Boys", "Girls", "Aggregate avg", "Maths avg", "English avg", "2nd Language avg", "Balance"];

    const summaryRows: SpreadsheetCell[][] = [
      summaryHeader,
      ...classStatistics.map((stat): SpreadsheetCell[] => [
        stat.className,
        classToTeacher[stat.className] ?? "",
        classConfigs.find((config) => config.id === stat.classId)?.grade ?? "",
        stat.totalStudents,
        stat.maleCount,
        stat.femaleCount,
        stat.averages["Aggregate %"],
        stat.averages["Maths %"],
        stat.averages["English %"],
        stat.averages["Afrikaans/Isizulu %"],
        `${overallBalance}%`,
      ]),
    ];

    const sheets: SpreadsheetSheet[] = [
      { name: "Summary", rows: summaryRows },
      ...classesWithStudents.map(({ config, students: classStudents }) => ({
        name: config.name,
        rows: [
          exportHeader,
          ...classStudents.map((student): SpreadsheetCell[] => [
            config.name,
            config.grade,
            classToTeacher[config.name] ?? "",
            student.firstName,
            student.lastName,
            student.studentId ?? "",
            student.gender ?? "",
            getExportCharacteristic(student, ["aggregate %", "aggregate"]),
            getExportCharacteristic(student, ["english %", "english"]),
            getExportCharacteristic(student, ["maths %", "maths"]),
            getExportCharacteristic(student, ["afrikaans/isizulu %", "2nd language %", "second language %"]),
            getExportCharacteristic(student, ["2nd language choice", "second language choice", "afrikaans/isizulu", "2nd language", "second language"]),
            getExportCharacteristic(student, ["medication"]),
            getExportCharacteristic(student, ["learner support", "learning support"]),
            getExportCharacteristic(student, ["race"]),
          ]),
        ],
      })),
    ];

    downloadXlsx(`shuffleschool-classes-${new Date().toISOString().slice(0, 10)}`, sheets);
    toast({
      title: "Export ready",
      description: `${classesWithStudents.length} class sheet${classesWithStudents.length === 1 ? "" : "s"} plus summary downloaded.`,
    });
  };

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
        const historySnapshot: PlacementSnapshot = placements.map(({ studentId, classId }) => ({ studentId, classId }));
        moveMutation.mutate({ studentId: draggedStudent.id, targetClassId, historySnapshot });
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
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                  data-testid="button-rerun-solver"
                >
                  <RefreshCw className={`mr-1 h-3.5 w-3.5 ${regenerateMutation.isPending ? "animate-spin" : ""}`} /> Re-Run
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0 || undoMutation.isPending}
                  title={undoStack.length > 0 ? `${undoStack.length} change${undoStack.length === 1 ? "" : "s"} to undo` : "No changes to undo"}
                  data-testid="button-undo"
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ""}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={handleExportClasses}
                  data-testid="button-export-classes"
                >
                  <Download className="mr-1 h-3.5 w-3.5" /> Export
                </Button>
              </div>

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

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Characteristic colours</label>
                <Select value={selectedColourCharacteristic} onValueChange={setSelectedColourCharacteristic}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-colour-characteristic"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No characteristic (gender)</SelectItem>
                    {colourableCharacteristics.map((characteristic) => (
                      <SelectItem key={characteristic.id} value={characteristic.id}>{characteristic.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {colourLegend.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-1 rounded border bg-muted/20 px-2 py-1.5" data-testid="colour-legend">
                    {colourLegend.map((item) => (
                      <span key={item.value} className="flex items-center gap-1 text-[10px] text-muted-foreground" title={item.value}>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.colour }} />
                        <span className="font-medium text-foreground">{item.value}</span> · {item.count}
                      </span>
                    ))}
                  </div>
                )}
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
                        const boostable = isCharacteristicBoostable(metric.characteristicId);
                        const isBoosting = characteristicBoostMutation.isPending
                          && characteristicBoostMutation.variables?.characteristicId === metric.characteristicId;
                        return (
                          <div key={metric.characteristicId} className={isVisible ? "space-y-1" : "space-y-1 opacity-50"}>
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <Checkbox className="h-3.5 w-3.5" checked={isVisible} onCheckedChange={(checked) => setHiddenCharacteristicIds((current) => checked ? current.filter((id) => id !== metric.characteristicId) : [...current, metric.characteristicId])} aria-label={`Show ${metric.name} balance`} />
                              <span className="min-w-0 flex-1 truncate">{metric.name}</span><span className="font-medium">{metric.score}%</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={!boostable || characteristicBoostMutation.isPending}
                                    onClick={() => characteristicBoostMutation.mutate({
                                      characteristicId: metric.characteristicId,
                                      name: metric.name,
                                      historySnapshot: placements.map(({ studentId, classId }) => ({ studentId, classId })),
                                    })}
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${boostable ? "text-amber-500 hover:bg-amber-500/15 hover:text-amber-600" : "cursor-not-allowed text-muted-foreground/40"}`}
                                    aria-label={`Boost ${metric.name} balance`}
                                    data-testid={`button-boost-characteristic-${metric.characteristicId}`}
                                  >
                                    {isBoosting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent><p>{boostable ? `Boost ${metric.name} balance` : "This characteristic cannot be boosted further."}</p></TooltipContent>
                              </Tooltip>
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
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => applyBoostMutation.mutate({ suggestion, historySnapshot: placements.map(({ studentId, classId }) => ({ studentId, classId })) })} disabled={applyBoostMutation.isPending} data-testid={`button-apply-boost-${suggestion.id}`}><Check className="mr-1 h-3 w-3" />Apply</Button>
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
                      {colourLegend.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1" data-testid={`class-colour-summary-${config.id}`}>
                          {getClassColourCounts(classStudents).map((item) => (
                            <span
                              key={item.value}
                              className="flex items-center gap-0.5 rounded bg-background px-1 py-px text-[9px] font-semibold leading-4"
                              style={{ color: item.colour }}
                              title={`${item.value}: ${item.count}`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.colour }} />
                              {item.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="p-1.5">
                      <div className="space-y-0.5">
                        {dragOverClass === config.id && draggedStudent && <div className="mb-1 rounded border border-dashed border-primary bg-primary/10 px-1.5 py-1 text-center text-[10px] font-medium text-primary">Drop {draggedStudent.firstName} here</div>}
                        {classStudents.length === 0 ? <p className="py-6 text-center text-[11px] text-muted-foreground">Drop students here</p> : classStudents.map((student) => {
                          const hasConflict = conflicts.some((conflict) => conflict.studentIds.includes(student.id));
                          const studentColour = getStudentColour(student);
                          return (
                            <motion.div key={student.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}>
                              <div draggable onDragStart={(event) => handleDragStart(event, student)} onDragEnd={() => { setDraggedStudent(null); setDragOverClass(null); }} className={`group flex h-7 items-center gap-1 rounded px-1 text-[11px] transition-colors hover:bg-muted cursor-grab active:cursor-grabbing ${hasConflict ? "border border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30" : "border border-transparent odd:bg-muted/35"} ${draggedStudent?.id === student.id ? "opacity-40 ring-1 ring-primary" : ""} ${recentlyMovedStudentId === student.id ? "bg-primary/15 ring-1 ring-primary/50" : ""}`} data-testid={`student-card-${student.id}`}>
                                <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                                <span
                                  className={`min-w-0 flex-1 truncate font-medium ${studentColour ? "" : getGenderTextClass(student.gender)}`}
                                  style={studentColour ? { color: studentColour } : undefined}
                                >
                                  {student.lastName}, {student.firstName}
                                </span>
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
                  <motion.div key={student.id} layout><div draggable onDragStart={(event) => handleDragStart(event, student)} onDragEnd={() => { setDraggedStudent(null); setDragOverClass(null); }} className="flex h-7 cursor-grab items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 text-[11px] active:cursor-grabbing dark:border-amber-900 dark:bg-amber-950/30"><GripVertical className="h-3 w-3 text-muted-foreground" /><span className={`font-medium ${getStudentColour(student) ? "" : getGenderTextClass(student.gender)}`} style={getStudentColour(student) ? { color: getStudentColour(student)! } : undefined}>{student.lastName}, {student.firstName}</span></div></motion.div>
                ))}
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
