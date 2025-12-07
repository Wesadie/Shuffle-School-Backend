import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Sliders, Tag, Sparkles, GripVertical } from "lucide-react";
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

interface CharacteristicTemplate {
  name: string;
  type: "category" | "scale";
  options: string[];
  priority: number;
  category: string;
}

const characteristicTemplates: CharacteristicTemplate[] = [
  { name: "Academic Level", type: "category", options: ["High", "Medium", "Low"], priority: 3, category: "Academic" },
  { name: "Reading Level", type: "category", options: ["Above Grade", "At Grade", "Below Grade"], priority: 2, category: "Academic" },
  { name: "Math Level", type: "category", options: ["Above Grade", "At Grade", "Below Grade"], priority: 2, category: "Academic" },
  { name: "Gifted/Talented", type: "category", options: ["Yes", "No"], priority: 2, category: "Academic" },
  { name: "Special Education", type: "category", options: ["IEP", "504 Plan", "None"], priority: 3, category: "Special Services" },
  { name: "English Language Learner", type: "category", options: ["Native", "Advanced", "Intermediate", "Beginner"], priority: 2, category: "Special Services" },
  { name: "Learning Support Tier", type: "category", options: ["Tier 1", "Tier 2", "Tier 3"], priority: 2, category: "Special Services" },
  { name: "Behavior", type: "category", options: ["Excellent", "Good", "Needs Support"], priority: 3, category: "Behavioral" },
  { name: "Social-Emotional", type: "category", options: ["Strong", "Developing", "Needs Support"], priority: 2, category: "Behavioral" },
  { name: "Self-Regulation", type: "category", options: ["Independent", "Developing", "Needs Assistance"], priority: 2, category: "Behavioral" },
  { name: "Leadership", type: "category", options: ["Strong Leader", "Emerging", "Follower"], priority: 1, category: "Behavioral" },
  { name: "Learning Style", type: "category", options: ["Visual", "Auditory", "Kinesthetic"], priority: 1, category: "Learning Profile" },
  { name: "Work Habits", type: "category", options: ["Consistent", "Variable", "Needs Structure"], priority: 2, category: "Learning Profile" },
  { name: "Attention/Focus", type: "category", options: ["Strong", "Moderate", "Needs Support"], priority: 2, category: "Learning Profile" },
];

export default function CharacteristicsPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingChar, setEditingChar] = useState<Characteristic | null>(null);
  const [optionInput, setOptionInput] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<InsertCharacteristic>>({
    name: "",
    type: "category",
    options: [],
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
    });
    setOptionInput("");
  };

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => apiRequest("POST", "/api/characteristics/reorder", { orderedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
    },
    onError: () => {
      toast({ title: "Failed to reorder characteristics", variant: "destructive" });
    },
  });

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
      options: (formData.options as string[] | undefined)?.filter((o) => o !== option),
    });
  };

  const openEditDialog = (char: Characteristic) => {
    setEditingChar(char);
    setFormData({
      name: char.name,
      type: char.type,
      options: char.options || [],
    });
  };

  const sortedCharacteristics = [...characteristics].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    const draggedIndex = sortedCharacteristics.findIndex(c => c.id === draggedId);
    const targetIndex = sortedCharacteristics.findIndex(c => c.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedId(null);
      return;
    }

    const newOrder = [...sortedCharacteristics];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    const orderedIds = newOrder.map(c => c.id);
    reorderMutation.mutate(orderedIds);
    setDraggedId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const addFromTemplate = (template: CharacteristicTemplate) => {
    const existingNames = characteristics.map(c => c.name.toLowerCase());
    if (existingNames.includes(template.name.toLowerCase())) {
      toast({ 
        title: "Already exists", 
        description: `"${template.name}" is already defined`,
        variant: "destructive" 
      });
      return;
    }
    createMutation.mutate({
      name: template.name,
      type: template.type,
      options: template.options,
    });
  };

  const getAvailableTemplates = () => {
    const existingNames = characteristics.map(c => c.name.toLowerCase());
    return characteristicTemplates.filter(t => !existingNames.includes(t.name.toLowerCase()));
  };

  const templatesByCategory = getAvailableTemplates().reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, CharacteristicTemplate[]>);

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
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant="outline" 
            onClick={() => setShowTemplates(!showTemplates)}
            data-testid="button-toggle-templates"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {showTemplates ? "Hide Templates" : "Quick Add"}
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-characteristic">
            <Plus className="h-4 w-4 mr-2" />
            Add Custom
          </Button>
        </div>
      </div>

      {showTemplates && Object.keys(templatesByCategory).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Quick Add Templates
            </CardTitle>
            <CardDescription>
              Click to instantly add common characteristics. Already added ones are hidden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(templatesByCategory).map(([category, templates]) => (
              <div key={category} className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{category}</h4>
                <div className="flex flex-wrap gap-2">
                  {templates.map((template) => (
                    <Button
                      key={template.name}
                      variant="outline"
                      size="sm"
                      onClick={() => addFromTemplate(template)}
                      disabled={createMutation.isPending}
                      data-testid={`button-template-${template.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {template.name}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {showTemplates && Object.keys(templatesByCategory).length === 0 && (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-muted-foreground">
              All template characteristics have been added. You can create custom ones using the "Add Custom" button.
            </p>
          </CardContent>
        </Card>
      )}

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
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-3">
            Drag to reorder priority. Items at the top have higher priority for balancing.
          </p>
          {sortedCharacteristics.map((char, index) => (
            <Card
              key={char.id}
              draggable
              onDragStart={(e) => handleDragStart(e, char.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, char.id)}
              onDragEnd={handleDragEnd}
              className={`cursor-grab active:cursor-grabbing transition-opacity ${
                draggedId === char.id ? "opacity-50" : ""
              }`}
              data-testid={`card-characteristic-${char.id}`}
            >
              <CardHeader className="py-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <GripVertical className="h-5 w-5" />
                    <span className="font-medium text-sm w-6">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        {char.name}
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {char.type === "category" ? "Category" : "Scale"}
                      </Badge>
                    </div>
                    {char.options && char.options.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {char.options.map((option) => (
                          <Badge key={option} variant="secondary" className="text-xs">
                            {option}
                          </Badge>
                        ))}
                      </div>
                    )}
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
              <p className="text-xs text-muted-foreground">
                Priority is set by dragging items in the list after adding.
              </p>
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
                    {(formData.options as string[]).map((option) => (
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
