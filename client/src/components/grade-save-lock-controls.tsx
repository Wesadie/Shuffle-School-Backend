import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Lock, Unlock, Save, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type GradeLock = { grade: string; locked: boolean; lockedAt: string | null; lockedBy: string | null };
type GradeSnapshot = { id: string; grade: string; name: string; description: string | null; savedAt: string };
type PlacementState = { revision: number };

export function GradeSaveLockControls({ grade }: { grade: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotDescription, setSnapshotDescription] = useState("");

  const { data: locks = [] } = useQuery<GradeLock[]>({ queryKey: ["/api/grade-locks"] });
  const { data: snapshots = [] } = useQuery<GradeSnapshot[]>({
    queryKey: ["/api/grade-snapshots", grade],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/grade-snapshots?grade=${encodeURIComponent(grade)}`);
      return response.json() as Promise<GradeSnapshot[]>;
    },
    enabled: Boolean(grade),
  });
  const { data: placementState } = useQuery<PlacementState>({ queryKey: ["/api/placements/state"] });
  const isLocked = locks.some((lock) => lock.grade === grade && lock.locked);

  const lockMutation = useMutation({
    mutationFn: async (locked: boolean) => apiRequest("POST", "/api/grade-locks", { grade, locked }),
    onSuccess: (_response, locked) => {
      queryClient.invalidateQueries({ queryKey: ["/api/grade-locks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/placements/state"] });
      toast({ title: locked ? `Grade ${grade} locked` : `Grade ${grade} unlocked` });
    },
    onError: (error: Error) => toast({ title: "Failed to update grade lock", description: error.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = snapshotName.trim() || `Grade ${grade} · ${new Date().toLocaleDateString()}`;
      return apiRequest("POST", "/api/grade-snapshots", { grade, name, description: snapshotDescription.trim() || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grade-snapshots", grade] });
      queryClient.invalidateQueries({ queryKey: ["/api/grade-snapshots"] });
      setSnapshotName("");
      setSnapshotDescription("");
      toast({ title: `Grade ${grade} snapshot saved` });
    },
    onError: (error: Error) => toast({ title: "Failed to save snapshot", description: error.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: async (snapshotId: string) => apiRequest("POST", `/api/grade-snapshots/${snapshotId}/restore`, {
      expectedRevision: placementState?.revision,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/placements/state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      toast({ title: `Grade ${grade} snapshot restored` });
    },
    onError: (error: Error) => toast({ title: "Failed to restore snapshot", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (snapshotId: string) => apiRequest("DELETE", `/api/grade-snapshots/${snapshotId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grade-snapshots", grade] });
      queryClient.invalidateQueries({ queryKey: ["/api/grade-snapshots"] });
      toast({ title: "Snapshot deleted" });
    },
    onError: (error: Error) => toast({ title: "Failed to delete snapshot", description: error.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-md border p-2" data-testid={`grade-save-lock-${grade}`}>
        <div className="flex items-center gap-2">
          <Badge variant={isLocked ? "destructive" : "outline"} data-testid={`grade-lock-status-${grade}`}>
            {isLocked ? <><Lock className="mr-1 h-3 w-3" />Locked</> : "Unlocked"}
          </Badge>
          {snapshots.length > 0 && <Badge variant="secondary">Saved · {snapshots.length}</Badge>}
        </div>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setOpen(true)} data-testid={`button-save-lock-grade-${grade}`}>
          <Save className="mr-1 h-3.5 w-3.5" /> Save &amp; Lock
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Save &amp; Lock Grade {grade}</DialogTitle>
            <DialogDescription>Save a permanent placement and class snapshot, then lock the grade to prevent future placement changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <section className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Grade status</p>
                  <p className="text-xs text-muted-foreground">{isLocked ? "Placement changes are blocked, including manual override." : "Placement changes are currently allowed."}</p>
                </div>
                <Badge variant={isLocked ? "destructive" : "outline"}>{isLocked ? "Locked" : "Unlocked"}</Badge>
              </div>
              {isLocked ? (
                <Button className="mt-3 w-full" variant="outline" onClick={() => setUnlockConfirmOpen(true)} disabled={lockMutation.isPending} data-testid={`button-unlock-grade-${grade}`}>
                  <Unlock className="mr-2 h-4 w-4" /> Unlock Grade {grade}
                </Button>
              ) : (
                <Button className="mt-3 w-full" onClick={() => lockMutation.mutate(true)} disabled={lockMutation.isPending} data-testid={`button-lock-grade-${grade}`}>
                  {lockMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  Lock Grade {grade}
                </Button>
              )}
            </section>

            <section className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Save current classes</p>
              <Input value={snapshotName} onChange={(event) => setSnapshotName(event.target.value)} placeholder={`Grade ${grade} snapshot name`} aria-label="Snapshot name" />
              <Textarea value={snapshotDescription} onChange={(event) => setSnapshotDescription(event.target.value)} placeholder="Optional description" aria-label="Snapshot description" />
              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid={`button-save-classes-${grade}`}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Classes
              </Button>
            </section>

            <section className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Saved snapshots</p>
              {snapshots.length === 0 ? <p className="text-xs text-muted-foreground">No saved snapshots for Grade {grade}.</p> : (
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {snapshots.map((snapshot) => (
                    <div key={snapshot.id} className="flex items-center justify-between gap-2 rounded-md border p-2" data-testid={`grade-snapshot-${snapshot.id}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{snapshot.name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(snapshot.savedAt).toLocaleString()}{snapshot.description ? ` · ${snapshot.description}` : ""}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" title="Restore snapshot placements" aria-label={`Restore ${snapshot.name}`} onClick={() => restoreMutation.mutate(snapshot.id)} disabled={isLocked || restoreMutation.isPending || placementState?.revision === undefined}>
                          {restoreMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete snapshot" aria-label={`Delete ${snapshot.name}`} onClick={() => deleteMutation.mutate(snapshot.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={unlockConfirmOpen} onOpenChange={setUnlockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock Grade {grade}?</AlertDialogTitle>
            <AlertDialogDescription>Unlocking allows placement changes again, including generation and manual movements. Existing saved snapshots will remain available.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep locked</AlertDialogCancel>
            <AlertDialogAction onClick={() => { lockMutation.mutate(false); setUnlockConfirmOpen(false); }} disabled={lockMutation.isPending} data-testid={`button-confirm-unlock-grade-${grade}`}>
              Unlock Grade {grade}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
