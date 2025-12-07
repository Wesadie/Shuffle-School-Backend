import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Sliders, GripVertical, Tag } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Characteristic, InsertCharacteristic } from "@shared/schema";

export default function CharacteristicsPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingChar, setEditingChar] = useState<Characteristic | null>(null);
  const [optionInput, setOptionInput] = useState("");

  const [formData, setFormData] = useState<Partial<InsertCharacteristic>>({
    name: "",
    type: "category",
    options: [],
    priority: 1,
  });

  const { data: characteristics = [], isLoading } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertCharacteristic) => apiRequest("POST", "/api/characteristics", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "Characteristic added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add characteristic", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertCharacteristic> }) =>
      apiRequest("PATCH", `/api/characteristics/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      setEditingChar(null);
      resetForm();
      toast({ title: "Characteristic updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update characteristic", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/characteristics/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      toast({ title: "Characteristic deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete characteristic", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      type: "category",
      options: [],
      priority: 1,
    });
    setOptionInput("");
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast({ title: "Please enter a name", variant: "destructive" });
      return;
    }

    if (editingChar) {
      updateMutation.mutate({ id: editingChar.id, data: formData as InsertCharacteristic });
    } else {
      createMutation.mutate(formData as InsertCharacteristic);
    }
  };

  const addOption = () => {
    if (optionInput.trim() && !formData.options?.includes(optionInput.trim())) {
      setFormData({
        ...formData,
        options: [...(formData.options || []), optionInput.trim()],
      });
      setOptionInput("");
    }
  };

  const removeOption = (option: string) => {
    setFormData({
      ...formData,
      options: formData.options?.filter((o) => o !== option),
    });
  };

  const openEditDialog = (char: Characteristic) => {
    setEditingChar(char);
    setFormData({
      name: char.name,
      type: char.type,
      options: char.options || [],
      priority: char.priority || 1,
    });
  };

  const priorityLabels: Record<number, string> = {
    1: "Low",
    2: "Medium",
    3: "High",
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Balance Characteristics</h1>
          <p className="text-muted-foreground mt-1">
            Define characteristics to balance across classes (e.g., academic level, behavior)
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-characteristic">
          <Plus className="h-4 w-4 mr-2" />
          Add Characteristic
        </Button>
      </div>

      {characteristics.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Sliders className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No characteristics defined</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Add characteristics like academic level, behavior, or special needs to balance across
              classes.
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-characteristic">
              <Plus className="h-4 w-4 mr-2" />
              Add First Characteristic
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {characteristics
            .sort((a, b) => (b.priority || 1) - (a.priority || 1))
            .map((char) => (
              <Card key={char.id} data-testid={`card-characteristic-${char.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        {char.name}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {char.type === "category" ? "Category" : "Scale"}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${
                            char.priority === 3
                              ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                              : char.priority === 2
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : ""
                          }`}
                        >
                          {priorityLabels[char.priority || 1]} Priority
                        </Badge>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(char)}
                        data-testid={`button-edit-characteristic-${char.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(char.id)}
                        data-testid={`button-delete-characteristic-${char.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {char.options && char.options.length > 0 && (
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {char.options.map((option) => (
                        <Badge key={option} variant="secondary" className="text-xs">
                          {option}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
        </div>
      )}

      <Dialog
        open={isAddDialogOpen || !!editingChar}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setEditingChar(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingChar ? "Edit Characteristic" : "Add New Characteristic"}
            </DialogTitle>
            <DialogDescription>
              Define a characteristic to track and balance across classes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Academic Level, Behavior, Special Needs"
                data-testid="input-characteristic-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, type: value as "category" | "scale" })
                  }
                >
                  <SelectTrigger data-testid="select-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="scale">Scale (1-5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={String(formData.priority)}
                  onValueChange={(value) => setFormData({ ...formData, priority: Number(value) })}
                >
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Low</SelectItem>
                    <SelectItem value="2">Medium</SelectItem>
                    <SelectItem value="3">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.type === "category" && (
              <div className="space-y-2">
                <Label>Options</Label>
                <div className="flex gap-2">
                  <Input
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    placeholder="Add an option"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                    data-testid="input-option"
                  />
                  <Button type="button" variant="outline" onClick={addOption} data-testid="button-add-option">
                    Add
                  </Button>
                </div>
                {formData.options && formData.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.options.map((option) => (
                      <Badge
                        key={option}
                        variant="secondary"
                        className="gap-1 cursor-pointer"
                        onClick={() => removeOption(option)}
                      >
                        {option}
                        <span className="text-muted-foreground hover:text-foreground">x</span>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Click on an option to remove it
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setEditingChar(null);
                resetForm();
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-characteristic"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingChar
                ? "Update"
                : "Add Characteristic"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
