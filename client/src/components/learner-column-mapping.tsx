import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { learnerFields, recognizeColumn, type ImportColumn } from "@shared/learner-import";

interface ColumnMappingProps {
  columns: ImportColumn[];
  characteristics: { name: string; type: string }[];
  disabled: boolean;
  mode: "add" | "update";
  onChange: (index: number, changes: Partial<ImportColumn>) => void;
}

export function LearnerColumnMapping({ columns, characteristics, disabled, mode, onChange }: ColumnMappingProps) {
  return <div className="grid gap-3 md:grid-cols-2">
    {columns.map((column, index) => {
      const value = column.kind === "ignore" || column.kind === "unmapped" ? column.kind
        : column.kind === "field" ? `field:${column.target}` : column.create ? "new" : `char:${column.target}`;
      const type = column.kind === "characteristic" ? (column.create ? column.type : characteristics.find((c) => c.name === column.target)?.type) : undefined;
      return <div key={index} className={`min-w-0 border rounded-lg p-3 space-y-2 ${column.kind === "ignore" ? "bg-muted/50" : ""}`}>
        <p className="text-sm font-medium break-words">Column {index + 1}: {column.heading || "(no heading)"}</p>
        <Select disabled={disabled} value={value} onValueChange={(next) => {
          if (next === "ignore" || next === "unmapped") onChange(index, { kind: next, target: "", create: false, type: undefined });
          else if (next === "new") {
            const suggested = recognizeColumn(column.heading, []);
            onChange(index, { kind: "characteristic", target: suggested.kind === "characteristic" ? suggested.target : column.heading.trim(), create: true, type: suggested.type || "category" });
          } else if (next.startsWith("field:")) onChange(index, { kind: "field", target: next.slice(6), create: false, type: undefined });
          else onChange(index, { kind: "characteristic", target: next.slice(5), create: false, type: undefined });
        }}>
          <SelectTrigger aria-label={`Map column ${index + 1}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unmapped">Choose a mapping…</SelectItem>
            {Object.entries(learnerFields).map(([key, label]) => <SelectItem key={key} value={`field:${key}`}>{label}{mode === "update" && key !== "studentId" ? " (read-only in update)" : ""}</SelectItem>)}
            {characteristics.map((c) => <SelectItem key={c.name} value={`char:${c.name}`}>{c.name}</SelectItem>)}
            <SelectItem value="new">Create new characteristic</SelectItem>
            <SelectItem value="ignore">Ignore this column</SelectItem>
          </SelectContent>
        </Select>
        {column.kind === "ignore" && <p className="text-xs text-muted-foreground">Explicitly excluded. Its values remain visible in the preview and will not be imported.</p>}
        {column.kind === "unmapped" && <p className="text-xs text-destructive">Choose a field, characteristic, new characteristic or Ignore. This column cannot be silently skipped.</p>}
        {column.kind === "characteristic" && column.create ? <div className="flex flex-col sm:flex-row gap-2">
          <Input disabled={disabled} className="min-w-0" aria-label={`New characteristic name for column ${index + 1}`} value={column.target} onChange={(e) => onChange(index, { target: e.target.value })} />
          <Select disabled={disabled} value={column.type} onValueChange={(next) => onChange(index, { type: next as ImportColumn["type"] })}>
            <SelectTrigger aria-label={`Characteristic type for column ${index + 1}`} className="sm:w-44 sm:shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="category">Categorical</SelectItem><SelectItem value="scale">Numerical</SelectItem><SelectItem value="percentage">Percentage (0–100)</SelectItem></SelectContent>
          </Select>
        </div> : type && <p className="text-xs text-muted-foreground">{type === "scale" ? "Numerical" : type === "percentage" ? "Percentage (0–100)" : "Categorical"} characteristic</p>}
      </div>;
    })}
  </div>;
}
