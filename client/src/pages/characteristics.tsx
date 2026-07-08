import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, GripVertical, HelpCircle, Palette, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  defaultResponseColor,
  getStableResponseId,
  normalizeResponses,
  responseTextColor,
} from "@shared/characteristics";
import type { Characteristic, CharacteristicResponse, ClassConfig, Student } from "@shared/schema";

type CharacteristicType = "category" | "scale" | "percentage";

type DraftCharacteristic = {
  id: string;
  name: string;
  type: CharacteristicType;
  priority: number;
  responseConfig: CharacteristicResponse[];
  tagOnly: boolean;
  multiSelect: boolean;
  adminOnly: boolean;
  applyToAllGrades: boolean;
  applicableGrades: string[];
  isNew?: boolean;
};

const friendlyTypeLabels: Record<CharacteristicType, string> = {
  category: "Category / Response",
  scale: "Scale / Numeric",
  percentage: "Percentage",
};

const settingTooltips = {
  tagOnly: {
    title: "Use this Characteristic as a Tag Only",
    body: "Turn this on if you would like to use this Characteristic as a tag only, rather than for balancing your classes.",
  },
  multiSelect: {
    title: "Allow Multiple Responses",
    body: "Turn this on if a student may have more than one response for this Characteristic.",
  },
  adminOnly: {
    title: "Hide this Characteristic from Teachers",
    body: "Turn this on if you don't want teachers to see this Characteristic in surveys or when sharing class lists.",
  },
};

const normalizeGradeLabel = (grade?: string | null) => (grade || "").replace(/^grade\s+/i, "").trim();

const colourFamilies = [
  {
    name: "Cyan / Light Blue",
    shades: ["#0e7490", "#0891b2", "#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc", "#cffafe", "#e0f2fe", "#bae6fd", "#7dd3fc"],
  },
  {
    name: "Blue",
    shades: ["#1e3a8a", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe", "#eff6ff", "#172554"],
  },
  {
    name: "Lime / Green",
    shades: ["#365314", "#4d7c0f", "#65a30d", "#84cc16", "#a3e635", "#bef264", "#d9f99d", "#ecfccb", "#f0fdf4", "#15803d"],
  },
  {
    name: "Purple / Magenta",
    shades: ["#701a75", "#86198f", "#a21caf", "#c026d3", "#d946ef", "#e879f9", "#f0abfc", "#f5d0fe", "#fae8ff", "#db2777"],
  },
  {
    name: "Orange",
    shades: ["#7c2d12", "#9a3412", "#c2410c", "#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5", "#fff7ed"],
  },
  {
    name: "Indigo / Dark Purple",
    shades: ["#312e81", "#3730a3", "#4338ca", "#4f46e5", "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#e0e7ff", "#581c87"],
  },
  {
    name: "Red",
    shades: ["#7f1d1d", "#991b1b", "#b91c1c", "#dc2626", "#ef4444", "#f87171", "#fca5a5", "#fecaca", "#fee2e2", "#fff1f2"],
  },
  {
    name: "Yellow / Gold",
    shades: ["#713f12", "#854d0e", "#a16207", "#ca8a04", "#eab308", "#facc15", "#fde047", "#fef08a", "#fef9c3", "#fefce8"],
  },
] as const;

const makeClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const toDraft = (char: Characteristic): DraftCharacteristic => ({
  id: char.id,
  name: char.name,
  type: char.type as CharacteristicType,
  priority: char.priority || 1,
  responseConfig: char.type === "category" ? normalizeResponses(char) : [],
  tagOnly: char.tagOnly ?? false,
  multiSelect: char.multiSelect ?? false,
  adminOnly: char.adminOnly ?? false,
  applyToAllGrades: char.applyToAllGrades ?? true,
  applicableGrades: char.applicableGrades || [],
});

export default function CharacteristicsPage() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftCharacteristic[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [draggedCharId, setDraggedCharId] = useState<string | null>(null);
  const [draggedResponse, setDraggedResponse] = useState<{ charId: string; responseId: string } | null>(null);
  const [openColourPickerId, setOpenColourPickerId] = useState<string | null>(null);

  const { data: characteristics = [], isLoading } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
  });

  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const { data: classConfigs = [] } = useQuery<ClassConfig[]>({
    queryKey: ["/api/class-configs"],
  });

  const gradeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...students.map((student) => normalizeGradeLabel(student.grade)),
          ...classConfigs.map((config) => normalizeGradeLabel(config.grade)),
        ].filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [students, classConfigs],
  );

  useEffect(() => {
    const nextDraft = [...characteristics]
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .map(toDraft);
    setDraft(nextDraft);
    setExpandedIds(new Set(nextDraft.slice(0, 6).map((char) => char.id)));
  }, [characteristics]);

  const studentCharacteristics = useMemo(
    () => students.map((student) => (student.characteristics || {}) as Record<string, string>),
    [students],
  );

  const saveMutation = useMutation({
    mutationFn: async (nextDraft: DraftCharacteristic[]) => {
      const payload = {
        characteristics: nextDraft.map((char, index) => ({
          id: char.id,
          name: char.name.trim(),
          type: char.type,
          priority: nextDraft.length - index,
          responseConfig: char.type === "category"
            ? char.responseConfig.map((response, responseIndex) => ({
                ...response,
                name: response.name.trim(),
                description: response.description || "",
                sortOrder: responseIndex + 1,
              }))
            : [],
          tagOnly: char.tagOnly,
          multiSelect: char.type === "category" ? char.multiSelect : false,
          adminOnly: char.adminOnly,
          applyToAllGrades: char.applyToAllGrades,
          applicableGrades: char.applyToAllGrades ? [] : char.applicableGrades,
        })),
      };
      const response = await apiRequest("PUT", "/api/characteristics/settings", payload);
      return response.json() as Promise<Characteristic[]>;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["/api/characteristics"], saved);
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ title: "Characteristic settings saved" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save settings",
        description: error?.message || "Please check the configuration and try again.",
        variant: "destructive",
      });
    },
  });

  const updateCharacteristic = (id: string, updates: Partial<DraftCharacteristic>) => {
    setDraft((current) => current.map((char) => (char.id === id ? { ...char, ...updates } : char)));
  };

  const updateResponse = (charId: string, responseId: string, updates: Partial<CharacteristicResponse>) => {
    setDraft((current) =>
      current.map((char) =>
        char.id === charId
          ? {
              ...char,
              responseConfig: char.responseConfig.map((response) =>
                response.id === responseId ? { ...response, ...updates } : response,
              ),
            }
          : char,
      ),
    );
  };

  const addCharacteristic = () => {
    if (draft.length >= 50) {
      toast({ title: "Maximum reached", description: "ShuffleSchool supports up to 50 active characteristics.", variant: "destructive" });
      return;
    }
    const id = makeClientId();
    const newCharacteristic: DraftCharacteristic = {
      id,
      name: "New Characteristic",
      type: "category",
      priority: draft.length + 1,
      responseConfig: [],
      tagOnly: false,
      multiSelect: false,
      adminOnly: false,
      applyToAllGrades: true,
      applicableGrades: [],
      isNew: true,
    };
    setDraft((current) => [...current, newCharacteristic]);
    setExpandedIds((current) => new Set([...current, id]));
  };

  const isCharacteristicUsed = (name: string) =>
    studentCharacteristics.some((chars) => Object.prototype.hasOwnProperty.call(chars, name));

  const isResponseUsed = (charName: string, responseName: string) =>
    studentCharacteristics.some((chars) => chars[charName] === responseName);

  const removeCharacteristic = (char: DraftCharacteristic) => {
    if (isCharacteristicUsed(char.name)) {
      const confirmed = window.confirm(
        `"${char.name}" is used by existing students. Removing the configured characteristic will preserve existing student JSON values, but the field will no longer appear as an active characteristic. Continue?`,
      );
      if (!confirmed) return;
    }
    setDraft((current) => current.filter((item) => item.id !== char.id));
  };

  const addResponse = (char: DraftCharacteristic) => {
    const responseName = "New Response";
    const response: CharacteristicResponse = {
      id: getStableResponseId(char.id, `${responseName}-${char.responseConfig.length + 1}`),
      name: responseName,
      color: defaultResponseColor(char.responseConfig.length),
      description: "",
      sortOrder: char.responseConfig.length + 1,
    };
    updateCharacteristic(char.id, { responseConfig: [...char.responseConfig, response] });
  };

  const removeResponse = (char: DraftCharacteristic, response: CharacteristicResponse) => {
    if (isResponseUsed(char.name, response.name)) {
      const confirmed = window.confirm(
        `"${response.name}" is used by existing students for "${char.name}". Removing the configured response will preserve those student values as legacy/unconfigured values. Continue?`,
      );
      if (!confirmed) return;
    }
    updateCharacteristic(char.id, {
      responseConfig: char.responseConfig.filter((item) => item.id !== response.id),
    });
  };

  const moveCharacteristic = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setDraft((current) => {
      const next = [...current];
      const sourceIndex = next.findIndex((char) => char.id === sourceId);
      const targetIndex = next.findIndex((char) => char.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const [removed] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, removed);
      return next;
    });
  };

  const moveResponse = (charId: string, sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setDraft((current) =>
      current.map((char) => {
        if (char.id !== charId) return char;
        const next = [...char.responseConfig];
        const sourceIndex = next.findIndex((response) => response.id === sourceId);
        const targetIndex = next.findIndex((response) => response.id === targetId);
        if (sourceIndex === -1 || targetIndex === -1) return char;
        const [removed] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, removed);
        return { ...char, responseConfig: next.map((response, index) => ({ ...response, sortOrder: index + 1 })) };
      }),
    );
  };

  const cancelChanges = () => {
    setDraft([...characteristics].sort((a, b) => (b.priority || 0) - (a.priority || 0)).map(toDraft));
    toast({ title: "Unsaved changes discarded" });
  };

  const SettingTooltip = ({ setting }: { setting: keyof typeof settingTooltips }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={settingTooltips[setting].title}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">{settingTooltips[setting].title}</p>
          <p className="text-xs text-muted-foreground">{settingTooltips[setting].body}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );

  const SettingToggle = ({
    active,
    label,
    disabled,
    onClick,
  }: {
    active: boolean;
    label: string;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className="h-8"
    >
      {active ? "On" : "Off"} · {label}
    </Button>
  );

  const toggleApplicableGrade = (char: DraftCharacteristic, grade: string) => {
    const normalized = normalizeGradeLabel(grade);
    const selected = new Set(char.applicableGrades.map(normalizeGradeLabel));
    if (selected.has(normalized)) selected.delete(normalized);
    else selected.add(normalized);
    updateCharacteristic(char.id, { applicableGrades: Array.from(selected) });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-80" />
        {[...Array(4)].map((_, index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Characteristics & Responses</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Configure the balancing characteristics and category responses used by the solver and student forms.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={cancelChanges} disabled={saveMutation.isPending} data-testid="button-cancel-characteristics">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending} data-testid="button-save-characteristics">
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>

      <Button onClick={addCharacteristic} data-testid="button-add-characteristic">
        <Plus className="h-4 w-4 mr-2" />
        Add Characteristic
      </Button>

      <div className="space-y-4">
        {draft.map((char, index) => {
          const isExpanded = expandedIds.has(char.id);
          return (
            <Card
              key={char.id}
              draggable
              onDragStart={() => setDraggedCharId(char.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedCharId) moveCharacteristic(draggedCharId, char.id);
                setDraggedCharId(null);
              }}
              className={draggedCharId === char.id ? "opacity-60" : ""}
              data-testid={`card-characteristic-${char.id}`}
            >
              <CardContent className="p-4">
                <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(360px,1.4fr)]">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <GripVertical className="h-5 w-5 cursor-grab" />
                      <Badge variant="outline">Priority {index + 1}</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() =>
                          setExpandedIds((current) => {
                            const next = new Set(current);
                            if (next.has(char.id)) next.delete(char.id);
                            else next.add(char.id);
                            return next;
                          })
                        }
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <div className="space-y-2">
                        <Label>Characteristic name</Label>
                        <Input
                          value={char.name}
                          onChange={(event) => updateCharacteristic(char.id, { name: event.target.value })}
                          data-testid={`input-characteristic-name-${char.id}`}
                        />
                        <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                          <div className="flex flex-wrap gap-2">
                            <div className="flex items-center gap-1">
                              <SettingToggle
                                active={char.tagOnly}
                                label="Tag Only"
                                onClick={() => updateCharacteristic(char.id, { tagOnly: !char.tagOnly })}
                              />
                              <SettingTooltip setting="tagOnly" />
                            </div>
                            <div className="flex items-center gap-1">
                              <SettingToggle
                                active={char.multiSelect}
                                label="Multi Select"
                                disabled={char.type !== "category"}
                                onClick={() => updateCharacteristic(char.id, { multiSelect: !char.multiSelect })}
                              />
                              <SettingTooltip setting="multiSelect" />
                            </div>
                            <div className="flex items-center gap-1">
                              <SettingToggle
                                active={char.adminOnly}
                                label="Admin Only"
                                onClick={() => updateCharacteristic(char.id, { adminOnly: !char.adminOnly })}
                              />
                              <SettingTooltip setting="adminOnly" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`all-grades-${char.id}`}
                                checked={char.applyToAllGrades}
                                onCheckedChange={(checked) =>
                                  updateCharacteristic(char.id, {
                                    applyToAllGrades: checked === true,
                                    applicableGrades: checked === true ? [] : char.applicableGrades,
                                  })
                                }
                              />
                              <Label htmlFor={`all-grades-${char.id}`} className="text-sm font-normal">
                                Apply to All Current Grades
                              </Label>
                            </div>
                            {!char.applyToAllGrades && (
                              <div className="flex flex-wrap gap-2 pl-6">
                                {gradeOptions.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">No current grades configured yet.</span>
                                ) : (
                                  gradeOptions.map((grade) => {
                                    const checked = char.applicableGrades.map(normalizeGradeLabel).includes(grade);
                                    return (
                                      <Button
                                        key={grade}
                                        type="button"
                                        variant={checked ? "default" : "outline"}
                                        size="sm"
                                        className="h-7"
                                        onClick={() => toggleApplicableGrade(char, grade)}
                                        aria-pressed={checked}
                                      >
                                        Grade {grade}
                                      </Button>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={char.type}
                          onValueChange={(value: CharacteristicType) =>
                            updateCharacteristic(char.id, {
                              type: value,
                              responseConfig: value === "category" ? char.responseConfig : [],
                              multiSelect: value === "category" ? char.multiSelect : false,
                            })
                          }
                        >
                          <SelectTrigger data-testid={`select-characteristic-type-${char.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(friendlyTypeLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeCharacteristic(char)}
                      data-testid={`button-delete-characteristic-${char.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete characteristic
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {char.type === "category" ? (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-medium">Responses</h3>
                            <p className="text-sm text-muted-foreground">Configure selectable response values, descriptions, and colours.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => addResponse(char)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Response
                          </Button>
                        </div>
                        {isExpanded && (
                          <div className="space-y-3">
                            {char.responseConfig.length === 0 ? (
                              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                No responses yet. Add responses for this category characteristic.
                              </div>
                            ) : (
                              char.responseConfig.map((response) => (
                                <div
                                  key={response.id}
                                  draggable
                                  onDragStart={() => setDraggedResponse({ charId: char.id, responseId: response.id })}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={() => {
                                    if (draggedResponse?.charId === char.id) moveResponse(char.id, draggedResponse.responseId, response.id);
                                    setDraggedResponse(null);
                                  }}
                                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[auto_auto_minmax(140px,1fr)_minmax(180px,1.3fr)_auto] md:items-center"
                                >
                                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                                  <Popover
                                    open={openColourPickerId === response.id}
                                    onOpenChange={(open) => setOpenColourPickerId(open ? response.id : null)}
                                  >
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="h-7 w-7 rounded-full border shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                        style={{ backgroundColor: response.color }}
                                        aria-label={`Choose colour for ${response.name}`}
                                        title="Choose response colour"
                                      />
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-3" align="start">
                                      <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                          <Palette className="h-4 w-4" />
                                          Choose colour
                                        </div>
                                        <div className="grid grid-cols-8 gap-1.5" role="grid" aria-label="Response colour palette">
                                          {colourFamilies.map((family) => (
                                            <div key={family.name} className="grid gap-1.5" role="row" aria-label={family.name}>
                                              {family.shades.map((color, shadeIndex) => {
                                                const isSelected = response.color.toLowerCase() === color.toLowerCase();
                                                return (
                                                  <button
                                                    key={color}
                                                    type="button"
                                                    className={`relative h-5 w-7 rounded-sm border shadow-sm transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                                                      isSelected ? "border-foreground ring-2 ring-foreground ring-offset-2" : "border-border"
                                                    }`}
                                                    style={{ backgroundColor: color }}
                                                    onClick={() => {
                                                      updateResponse(char.id, response.id, { color });
                                                      setOpenColourPickerId(null);
                                                    }}
                                                    aria-label={`${family.name} shade ${shadeIndex + 1} ${color}${isSelected ? ", selected" : ""}`}
                                                    title={`${family.name} shade ${shadeIndex + 1} (${color})`}
                                                  >
                                                    {isSelected && (
                                                      <Check
                                                        className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2"
                                                        style={{ color: responseTextColor(color) }}
                                                        aria-hidden="true"
                                                      />
                                                    )}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  <Input
                                    value={response.name}
                                    onChange={(event) => updateResponse(char.id, response.id, { name: event.target.value })}
                                    placeholder="Response name"
                                  />
                                  <Textarea
                                    value={response.description || ""}
                                    onChange={(event) => updateResponse(char.id, response.id, { description: event.target.value })}
                                    placeholder="Optional description/help text"
                                    rows={1}
                                  />
                                  <div className="flex items-center gap-2">
                                    <Badge style={{ backgroundColor: response.color, color: responseTextColor(response.color) }}>
                                      Preview
                                    </Badge>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeResponse(char, response)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <h3 className="font-medium">{friendlyTypeLabels[char.type]}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          This characteristic uses numeric values in student records. Category responses are not required.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
