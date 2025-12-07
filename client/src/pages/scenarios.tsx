import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Layers, Plus, Trash2, RotateCcw, ArrowLeftRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Scenario, Placement } from "@shared/schema";

export default function ScenariosPage() {
  const { toast } = useToast();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [compareScenarios, setCompareScenarios] = useState<[string | null, string | null]>([null, null]);

  const { data: scenarios = [], isLoading } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  const { data: placements = [] } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
  });

  const saveMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/scenarios", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      toast({ title: "Scenario saved", description: "Current placements saved successfully" });
      setSaveDialogOpen(false);
      setScenarioName("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save scenario",
        description: error.message || "Make sure you have generated classes first",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/scenarios/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      toast({ title: "Scenario deleted" });
      setDeleteId(null);
      if (compareScenarios[0] === deleteId) setCompareScenarios([null, compareScenarios[1]]);
      if (compareScenarios[1] === deleteId) setCompareScenarios([compareScenarios[0], null]);
    },
    onError: () => {
      toast({ title: "Failed to delete scenario", variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/scenarios/${id}/restore`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      toast({ title: "Scenario restored", description: "Placements have been restored from this scenario" });
      setRestoreId(null);
    },
    onError: () => {
      toast({ title: "Failed to restore scenario", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!scenarioName.trim()) {
      toast({ title: "Please enter a name", variant: "destructive" });
      return;
    }
    saveMutation.mutate(scenarioName.trim());
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleCompareToggle = (scenarioId: string) => {
    if (compareScenarios[0] === scenarioId) {
      setCompareScenarios([null, compareScenarios[1]]);
    } else if (compareScenarios[1] === scenarioId) {
      setCompareScenarios([compareScenarios[0], null]);
    } else if (!compareScenarios[0]) {
      setCompareScenarios([scenarioId, compareScenarios[1]]);
    } else if (!compareScenarios[1]) {
      setCompareScenarios([compareScenarios[0], scenarioId]);
    } else {
      setCompareScenarios([scenarioId, compareScenarios[1]]);
    }
  };

  const scenario1 = scenarios.find(s => s.id === compareScenarios[0]);
  const scenario2 = scenarios.find(s => s.id === compareScenarios[1]);

  const getBalanceDiff = (val1: number, val2: number) => {
    const diff = val2 - val1;
    if (Math.abs(diff) < 0.1) return { icon: Minus, color: "text-muted-foreground", text: "0" };
    if (diff > 0) return { icon: TrendingUp, color: "text-green-600", text: `+${diff.toFixed(1)}` };
    return { icon: TrendingDown, color: "text-red-600", text: diff.toFixed(1) };
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Layers className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Scenarios</h1>
            <p className="text-muted-foreground">Save and compare different placement configurations</p>
          </div>
        </div>
        <Button
          onClick={() => setSaveDialogOpen(true)}
          disabled={placements.length === 0}
          data-testid="button-save-scenario"
        >
          <Plus className="h-4 w-4 mr-2" />
          Save Current
        </Button>
      </div>

      {placements.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Generate classes first to save scenarios. Go to "Generate Classes" to create placements.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : scenarios.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No scenarios saved yet. Save your current placements to create a scenario.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scenarios.map((scenario) => {
              const isSelected = compareScenarios.includes(scenario.id);
              const selectionIndex = compareScenarios[0] === scenario.id ? 1 : compareScenarios[1] === scenario.id ? 2 : 0;
              
              return (
                <Card
                  key={scenario.id}
                  className={isSelected ? "ring-2 ring-primary" : ""}
                  data-testid={`card-scenario-${scenario.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate flex items-center gap-2">
                          {scenario.name}
                          {isSelected && (
                            <Badge variant="default" className="shrink-0">
                              {selectionIndex}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>{formatDate(scenario.createdAt)}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Overall Balance</span>
                      <Badge variant="secondary">
                        {scenario.balanceMetrics?.overallBalance ?? 0}%
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Students</span>
                      <span className="text-sm font-medium">{scenario.placements?.length ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Classes</span>
                      <span className="text-sm font-medium">
                        {scenario.balanceMetrics?.classBalances?.length ?? 0}
                      </span>
                    </div>

                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => handleCompareToggle(scenario.id)}
                        data-testid={`button-compare-${scenario.id}`}
                      >
                        <ArrowLeftRight className="h-3 w-3 mr-1" />
                        Compare
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRestoreId(scenario.id)}
                        data-testid={`button-restore-${scenario.id}`}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteId(scenario.id)}
                        data-testid={`button-delete-${scenario.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {(scenario1 || scenario2) && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5" />
                  Comparison
                </CardTitle>
                <CardDescription>
                  {scenario1 && scenario2
                    ? `Comparing "${scenario1.name}" vs "${scenario2.name}"`
                    : scenario1
                    ? `Select another scenario to compare with "${scenario1.name}"`
                    : `Select another scenario to compare with "${scenario2?.name}"`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scenario1 && scenario2 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-sm font-medium border-b pb-2">
                      <div>Metric</div>
                      <div className="text-center">{scenario1.name}</div>
                      <div className="text-center">{scenario2.name}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 items-center">
                      <div className="text-muted-foreground">Overall Balance</div>
                      <div className="text-center font-medium">
                        {scenario1.balanceMetrics?.overallBalance ?? 0}%
                      </div>
                      <div className="text-center font-medium flex items-center justify-center gap-1">
                        {scenario2.balanceMetrics?.overallBalance ?? 0}%
                        {(() => {
                          const { icon: Icon, color, text } = getBalanceDiff(
                            scenario1.balanceMetrics?.overallBalance ?? 0,
                            scenario2.balanceMetrics?.overallBalance ?? 0
                          );
                          return (
                            <span className={`flex items-center text-xs ${color}`}>
                              <Icon className="h-3 w-3" />
                              {text}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 items-center">
                      <div className="text-muted-foreground">Total Students</div>
                      <div className="text-center">{scenario1.placements?.length ?? 0}</div>
                      <div className="text-center">{scenario2.placements?.length ?? 0}</div>
                    </div>

                    <div className="border-t pt-4 mt-4">
                      <h4 className="font-medium mb-3">Class Balances</h4>
                      <div className="space-y-2">
                        {scenario1.balanceMetrics?.classBalances?.map((cb1) => {
                          const cb2 = scenario2.balanceMetrics?.classBalances?.find(
                            c => c.className === cb1.className
                          );
                          const { icon: Icon, color, text } = getBalanceDiff(
                            cb1.balance,
                            cb2?.balance ?? 0
                          );

                          return (
                            <div key={cb1.classId} className="grid grid-cols-3 gap-4 items-center text-sm">
                              <div className="text-muted-foreground">{cb1.className}</div>
                              <div className="text-center">{cb1.balance}%</div>
                              <div className="text-center flex items-center justify-center gap-1">
                                {cb2?.balance ?? "N/A"}%
                                {cb2 && (
                                  <span className={`flex items-center text-xs ${color}`}>
                                    <Icon className="h-3 w-3" />
                                    {text}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">
                    Click "Compare" on two scenarios to see a side-by-side comparison.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Scenario</DialogTitle>
            <DialogDescription>
              Save the current class placements as a named scenario for later comparison.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="scenario-name">Scenario Name</Label>
              <Input
                id="scenario-name"
                placeholder="e.g., Initial Draft, Optimized Version"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                data-testid="input-scenario-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-confirm-save"
            >
              {saveMutation.isPending ? "Saving..." : "Save Scenario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scenario</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scenario? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreId} onOpenChange={() => setRestoreId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Scenario</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current placements with the ones from this scenario. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreId && restoreMutation.mutate(restoreId)}
              data-testid="button-confirm-restore"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
