import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Check,
  ClipboardList,
  GraduationCap,
  Settings2,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import type { ClassConfig, Placement, Rule, Student, Teacher } from "@shared/schema";

const workflowStages = [
  {
    title: "Import & Setup",
    description:
      "Add your students and teachers, then configure the characteristics you want to use when creating balanced classes.",
  },
  {
    title: "Requests & Preferences",
    description:
      "Add placement requests, separation requests, teacher preferences, and other learner requirements.",
  },
  {
    title: "Create Balanced Classes",
    description:
      "Configure the new classes, run the solver, review the results, and make adjustments where needed.",
  },
];

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: students = [], isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const { data: teachers = [], isLoading: teachersLoading } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: requests = [], isLoading: requestsLoading } = useQuery<Rule[]>({
    queryKey: ["/api/rules"],
  });

  const { data: classConfigs = [], isLoading: classesLoading } = useQuery<ClassConfig[]>({
    queryKey: ["/api/class-configs"],
  });

  const { data: placements = [], isLoading: placementsLoading } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
  });

  const isLoading = studentsLoading || teachersLoading || requestsLoading || classesLoading || placementsLoading;

  const placedStudentCount = useMemo(() => {
    const validStudentIds = new Set(students.map((student) => student.id));
    return new Set(
      placements
        .map((placement) => placement.studentId)
        .filter((studentId) => validStudentIds.has(studentId)),
    ).size;
  }, [placements, students]);

  const placementProgress = students.length > 0 ? Math.round((placedStudentCount / students.length) * 100) : 0;

  const stageStatuses = isLoading
    ? (["loading", "loading", "loading"] as const)
    : ([
        students.length > 0 && teachers.length > 0 ? "complete" : students.length > 0 || teachers.length > 0 ? "active" : "pending",
        requests.length > 0 ? "complete" : "pending",
        placements.length > 0 ? "complete" : classConfigs.length > 0 ? "active" : "pending",
      ] as const);

  const stats = [
    { label: "Students", value: students.length, icon: Users },
    { label: "Teachers", value: teachers.length, icon: GraduationCap },
    { label: "Requests", value: requests.length, icon: ClipboardList },
    { label: "Classes", value: classConfigs.length, icon: Settings2 },
    { label: "Students Placed", value: placedStudentCount, icon: Check },
    { label: "Placement Progress", value: `${placementProgress}%`, icon: BarChart3 },
  ];

  const quickActions = [
    { label: "Import Students", href: "/students", icon: Users, description: "Open the student workspace" },
    { label: "Add Teacher", href: "/teachers", icon: UserPlus, description: "Manage teacher records" },
    { label: "Add Request", href: "/rules", icon: ClipboardList, description: "Set placement preferences" },
    { label: "Configure Classes", href: "/generate", icon: Settings2, description: "Create class setup" },
    { label: "Open Solver", href: "/review", icon: Sparkles, description: "Review generated classes" },
  ];

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome to ShuffleSchool{user?.firstName ? `, ${user.firstName}!` : ""}
        </h1>
        <p className="text-muted-foreground max-w-3xl">
          Follow your class placement workflow from setup through requests, generation, and review.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow Progress</CardTitle>
          <CardDescription>Track your real setup progress through the main ShuffleSchool workflow.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {workflowStages.map((stage, index) => {
              const status = stageStatuses[index];
              const isComplete = status === "complete";
              const isActive = status === "active";
              const isChecking = status === "loading";

              return (
                <div
                  key={stage.title}
                  className="relative rounded-lg border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={
                        isComplete
                          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                          : isActive
                            ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-primary text-primary"
                            : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground"
                      }
                    >
                      {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{stage.title}</h3>
                        <Badge variant={isComplete ? "default" : isActive ? "secondary" : "outline"}>
                          {isChecking ? "Checking" : isComplete ? "Complete" : isActive ? "Started" : "Not started"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{stage.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">School Overview</h2>
          <p className="text-sm text-muted-foreground">Summary cards use live data from existing ShuffleSchool APIs.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    {isLoading ? <Skeleton className="h-6 w-12" /> : <div className="text-2xl font-bold">{stat.value}</div>}
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">{stat.label}</div>
                  {stat.label === "Placement Progress" && <Progress value={placementProgress} className="h-2" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Quick Actions</h2>
          <p className="text-sm text-muted-foreground">Jump into the existing workflow pages.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href}>
                <Card className="h-full cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30">
                  <CardContent className="flex h-full flex-col justify-between gap-4 p-4">
                    <div className="space-y-3">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary w-fit">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{action.label}</h3>
                        <p className="text-sm text-muted-foreground">{action.description}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="w-fit px-0">
                      Open <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
