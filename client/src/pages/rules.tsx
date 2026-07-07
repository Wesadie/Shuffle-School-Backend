import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Link2, Unlink, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Rule, InsertRule, Student } from "@shared/schema";

export default function RulesPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"pair" | "separate">("pair");
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState<Partial<InsertRule>>({
    type: "pair",
    studentId1: "",
    studentId2: "",
    reason: "",
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery<Rule[]>({
    queryKey: ["/api/rules"],
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertRule) => apiRequest("POST", "/api/rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "Rule added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add rule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
      toast({ title: "Rule deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete rule", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      type: activeTab,
      studentId1: "",
      studentId2: "",
      reason: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.studentId1 || !formData.studentId2) {
      toast({ title: "Please select both students", variant: "destructive" });
      return;
    }
    if (formData.studentId1 === formData.studentId2) {
      toast({ title: "Please select two different students", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...formData,
      type: activeTab,
    } as InsertRule);
  };

  const getStudentName = (id: string) => {
    const student = students.find((s) => s.id === id);
    return student ? `${student.firstName} ${student.lastName}` : "Unknown";
  };

  const pairingRules = rules.filter((r) => r.type === "pair");
  const separationRules = rules.filter((r) => r.type === "separate");

  const filteredStudents = students.filter(
    (s) =>
      s.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.lastName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isLoading = rulesLoading || studentsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Rules</h1>
          <p className="text-muted-foreground mt-1">
            Define which students should be paired together or kept apart
          </p>
        </div>
        <Button
          onClick={() => {
            setFormData({ ...formData, type: activeTab });
            setIsAddDialogOpen(true);
          }}
          disabled={students.length < 2}
          data-testid="button-add-rule"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {students.length < 2 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">Not enough students</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              You need at least 2 students to create pairing or separation rules.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pair" | "separate")}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="pair" className="gap-2" data-testid="tab-pairings">
              <Link2 className="h-4 w-4" />
              Pairings ({pairingRules.length})
            </TabsTrigger>
            <TabsTrigger value="separate" className="gap-2" data-testid="tab-separations">
              <Unlink className="h-4 w-4" />
              Separations ({separationRules.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pair" className="mt-6">
            {pairingRules.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Link2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No pairing rules yet</h3>
                  <p className="text-muted-foreground text-center max-w-sm mb-4">
                    Pairing rules ensure certain students are placed in the same class.
                  </p>
                  <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-pairing">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Pairing Rule
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pairingRules.map((rule) => (
                  <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          <Link2 className="h-3 w-3 mr-1" />
                          Pair Together
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(rule.id)}
                          data-testid={`button-delete-rule-${rule.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-sm font-medium truncate">
                            {getStudentName(rule.studentId1)}
                          </div>
                          <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 text-sm font-medium truncate text-right">
                            {getStudentName(rule.studentId2)}
                          </div>
                        </div>
                        {rule.reason && (
                          <p className="text-xs text-muted-foreground">{rule.reason}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="separate" className="mt-6">
            {separationRules.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Unlink className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No separation rules yet</h3>
                  <p className="text-muted-foreground text-center max-w-sm mb-4">
                    Separation rules ensure certain students are placed in different classes.
                  </p>
                  <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-separation">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Separation Rule
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {separationRules.map((rule) => (
                  <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          <Unlink className="h-3 w-3 mr-1" />
                          Keep Apart
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(rule.id)}
                          data-testid={`button-delete-rule-${rule.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-sm font-medium truncate">
                            {getStudentName(rule.studentId1)}
                          </div>
                          <Unlink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 text-sm font-medium truncate text-right">
                            {getStudentName(rule.studentId2)}
                          </div>
                        </div>
                        {rule.reason && (
                          <p className="text-xs text-muted-foreground">{rule.reason}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {activeTab === "pair" ? "Add Pairing Rule" : "Add Separation Rule"}
            </DialogTitle>
            <DialogDescription>
              {activeTab === "pair"
                ? "Select two students who should be placed in the same class."
                : "Select two students who should be kept in different classes."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="student1">First Student</Label>
              <Select
                value={formData.studentId1}
                onValueChange={(value) => setFormData({ ...formData, studentId1: value })}
              >
                <SelectTrigger data-testid="select-student-1">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search students..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                        data-testid="input-search-student-1"
                      />
                    </div>
                  </div>
                  {filteredStudents
                    .filter((s) => s.id !== formData.studentId2)
                    .map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.firstName} {student.lastName} (Grade {student.grade})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="student2">Second Student</Label>
              <Select
                value={formData.studentId2}
                onValueChange={(value) => setFormData({ ...formData, studentId2: value })}
              >
                <SelectTrigger data-testid="select-student-2">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {filteredStudents
                    .filter((s) => s.id !== formData.studentId1)
                    .map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.firstName} {student.lastName} (Grade {student.grade})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Add a reason for this rule..."
                rows={2}
                data-testid="textarea-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              data-testid="button-save-rule"
            >
              {createMutation.isPending ? "Saving..." : "Add Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
