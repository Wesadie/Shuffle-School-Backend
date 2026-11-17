import { useState } from "react";
import { Upload, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { readLearnerSpreadsheet, type LearnerSheet } from "@/lib/learner-spreadsheet";
import { learnerFields, recognizeColumn, type ImportColumn, type ImportReview } from "@shared/learner-import";
import type { Characteristic } from "@shared/schema";

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characteristics: Pick<Characteristic, "name" | "type">[];
  importType?: "students" | "characteristics";
}

export function CSVImportDialog({ open, onOpenChange, characteristics, importType = "students" }: CSVImportDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<LearnerSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [columns, setColumns] = useState<ImportColumn[]>([]);
  const [mode, setMode] = useState<"add" | "update">(importType === "characteristics" ? "update" : "add");
  const [review, setReview] = useState<ImportReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [page, setPage] = useState(0);
  const sheet = sheets[sheetIndex];
  const rows = sheet?.rows.slice(1) || [];
  const resetReview = () => { setReview(null); setConfirmed(false); setError(null); };
  const selectSheet = (index: number, source = sheets) => {
    setSheetIndex(index);
    const raw = source[index]?.rows || [];
    const width = Math.max(0, ...raw.map((row) => row.length));
    setColumns(Array.from({ length: width }, (_, i) => recognizeColumn(raw[0]?.[i] || "", characteristics)));
    setPage(0); resetReview();
  };
  const removeFile = () => { setFile(null); setSheets([]); setColumns([]); setPage(0); resetReview(); };
  const handleClose = () => { if (busy) return; removeFile(); setMode(importType === "characteristics" ? "update" : "add"); onOpenChange(false); };
  const handleFile = async (selected: File) => {
    removeFile(); setFile(selected); setBusy(true);
    try {
      const loaded = await readLearnerSpreadsheet(selected);
      if (!loaded.length) throw new Error("The workbook has no worksheets.");
      setSheets(loaded); selectSheet(0, loaded);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to read spreadsheet."); }
    finally { setBusy(false); }
  };
  const updateColumn = (index: number, changes: Partial<ImportColumn>) => {
    setColumns((current) => current.map((column, i) => i === index ? { ...column, ...changes } : column));
    resetReview();
  };
  const requestImport = async (preview: boolean) => {
    setBusy(true); setError(null);
    try {
      const response = await apiRequest("POST", "/api/students/bulk-import", { mode, columns, rows, preview, reviewedRevision: preview ? undefined : review?.revision });
      const result = await response.json() as ImportReview & { added?: number; updated?: number };
      setReview(result); setConfirmed(false);
      if (!preview) {
        queryClient.invalidateQueries({ queryKey: ["/api/students"] });
        queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
        toast({ title: "Import complete", description: `${result.added || 0} added · ${result.updated || 0} updated · ${result.rows.filter((row) => row.status === "skipped").length} skipped. Placements and teacher allocations unchanged.` });
        setFile(null); setSheets([]); setColumns([]); setReview(null); onOpenChange(false);
      }
    } catch (err) {
      let message = err instanceof Error ? err.message : "Import failed.";
      const start = message.indexOf("{");
      if (start >= 0) {
        try {
          const result = JSON.parse(message.slice(start));
          message = result.error || result.message || message;
          if (result.rows && result.errors) setReview(result);
        } catch { /* Preserve non-JSON error text. */ }
      }
      setError(message);
    } finally { setBusy(false); }
  };
  const downloadTemplate = () => {
    const headings = importType === "characteristics" ? ["Student ID", ...characteristics.map((c) => c.name)] : [...Object.values(learnerFields), ...characteristics.map((c) => c.name)];
    const blob = new Blob([headings.map((h) => `"${h.replace(/"/g, '""')}"`).join(";") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "student-template.csv"; link.click(); URL.revokeObjectURL(url);
  };
  const skipped = review?.rows.filter((row) => row.status === "skipped").length || 0;

  return <Dialog open={open} onOpenChange={handleClose}>
    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Import Learners — Excel or CSV</DialogTitle>
        <DialogDescription>Review every column and learner before importing. No data is written during validation.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Import option">
          <Button disabled={busy} variant={mode === "add" ? "default" : "outline"} onClick={() => { setMode("add"); resetReview(); }}>Add New Learners</Button>
          <Button disabled={busy} variant={mode === "update" ? "default" : "outline"} onClick={() => { setMode("update"); resetReview(); }}>Update Existing Learners</Button>
        </div>
        <p className="text-sm text-muted-foreground">{mode === "add" ? "Existing Student IDs are skipped, never overwritten. Student ID, First Name, Last Name, Gender and Current Grade are required." : "Match Student ID in this school. Update only non-blank marks and characteristics; preserve learner details, grades, class placements and teacher allocations."}</p>
        {!file ? <div className="border-2 border-dashed rounded-lg p-6 text-center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!busy && e.dataTransfer.files[0]) void handleFile(e.dataTransfer.files[0]); }}>
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm mb-3">Drop an .xlsx or .csv file here (up to 10 MB).</p>
          <label><input type="file" accept=".xlsx,.csv" disabled={busy} className="hidden" data-testid="input-csv-file" onChange={(e) => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }} /><Button asChild variant="outline"><span className="cursor-pointer">Browse Files</span></Button></label>
          <Button variant="ghost" onClick={downloadTemplate} data-testid="button-download-template"><Download className="h-4 w-4 mr-2" />Download CSV Template</Button>
        </div> : <div className="flex items-center gap-2 rounded-lg bg-muted p-3"><span className="flex-1 truncate">{file.name}</span><Button size="icon" variant="ghost" disabled={busy} onClick={removeFile} aria-label="Remove file" data-testid="button-remove-file"><X className="h-4 w-4" /></Button></div>}
        {busy && <p role="status">Processing spreadsheet…</p>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {sheets.length > 1 && <div className="space-y-2">
          <p className="text-sm">This workbook contains {sheets.length} worksheets. Only the selected sheet is imported; select and import each remaining sheet separately.</p>
          <Select disabled={busy} value={String(sheetIndex)} onValueChange={(value) => selectSheet(Number(value))}><SelectTrigger aria-label="Worksheet"><SelectValue /></SelectTrigger><SelectContent>{sheets.map((s, i) => <SelectItem key={i} value={String(i)}>{s.name} ({Math.max(0, s.rows.length - 1)} rows)</SelectItem>)}</SelectContent></Select>
        </div>}
        {columns.length > 0 && <>
          <div className="space-y-2">
            <h3 className="font-medium">Column mapping — no columns excluded</h3>
            <p className="text-sm text-muted-foreground">Unmatched headings can create a new characteristic. Confirm its name and type, or map it to a saved characteristic. All changes are saved together with the import.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {columns.map((column, i) => <div key={i} className="border rounded-lg p-3 space-y-2">
                <label className="text-sm font-medium">Column {i + 1}: {column.heading || "(missing heading — fix source file)"}</label>
                <Select disabled={busy} value={column.kind === "field" ? `field:${column.target}` : column.create ? "new" : `char:${column.target}`} onValueChange={(value) => {
                  if (value === "new") updateColumn(i, { kind: "characteristic", target: column.heading.trim(), create: true, type: recognizeColumn(column.heading, []).type || "category" });
                  else if (value.startsWith("field:")) updateColumn(i, { kind: "field", target: value.slice(6), create: false, type: undefined });
                  else updateColumn(i, { kind: "characteristic", target: value.slice(5), create: false, type: undefined });
                }}><SelectTrigger aria-label={`Map column ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>
                  {Object.entries(learnerFields).map(([key, label]) => <SelectItem key={key} value={`field:${key}`}>{label}{mode === "update" && key !== "studentId" ? " (read-only in update)" : ""}</SelectItem>)}
                  {characteristics.map((c) => <SelectItem key={c.name} value={`char:${c.name}`}>{c.name}</SelectItem>)}
                  <SelectItem value="new">Create new characteristic</SelectItem>
                </SelectContent></Select>
                {column.kind === "characteristic" && column.create && <div className="flex gap-2">
                  <Input disabled={busy} aria-label={`New characteristic name for column ${i + 1}`} value={column.target} onChange={(e) => updateColumn(i, { target: e.target.value })} />
                  <Select disabled={busy} value={column.type} onValueChange={(value) => updateColumn(i, { type: value as ImportColumn["type"] })}><SelectTrigger aria-label={`Characteristic type for column ${i + 1}`} className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="category">Category</SelectItem><SelectItem value="scale">Numeric scale</SelectItem><SelectItem value="percentage">Percentage (0–100)</SelectItem></SelectContent></Select>
                </div>}
              </div>)}
            </div>
          </div>
          <h3 className="font-medium">Spreadsheet preview — {rows.length} rows, {columns.length} columns</h3>
          <div className="border rounded-lg overflow-auto max-h-80">
            <table className="text-sm w-full"><thead className="bg-muted"><tr><th className="p-2 text-left">Spreadsheet row</th>{columns.map((c, i) => <th key={i} className="p-2 text-left whitespace-nowrap">{c.heading || `(Column ${i + 1})`}</th>)}<th className="p-2 text-left">Validation / outcome</th></tr></thead>
              <tbody>{rows.slice(page * 50, (page + 1) * 50).map((cells, i) => {
                const index = page * 50 + i, result = review?.rows[index];
                return <tr key={index} className="border-t"><td className="p-2">{index + 2}</td>{columns.map((_, c) => <td key={c} className="p-2 whitespace-pre-wrap min-w-28">{cells[c] ?? ""}</td>)}<td className={`p-2 min-w-64 ${result?.status === "error" ? "text-destructive" : ""}`}>{result ? `${result.status}: ${result.explanation}` : "Not yet validated"}</td></tr>;
              })}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm"><span>Rows {rows.length ? page * 50 + 1 : 0}–{Math.min((page + 1) * 50, rows.length)} of {rows.length}. Every row is available for review.</span><div className="flex gap-2"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={(page + 1) * 50 >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div></div>
          <Button variant="outline" disabled={busy || !rows.length} onClick={() => void requestImport(true)}>Validate & Review Import</Button>
        </>}
        {review && <div className="space-y-3" aria-live="polite">
          <p className="font-medium">{review.count} ready to {mode === "add" ? "add" : "update"} · {skipped} skipped · {review.rows.filter((r) => r.status === "error").length} invalid rows</p>
          {review.errors.length > 0 && <Alert variant="destructive"><AlertDescription><p>No data will be changed until all errors are resolved.</p><ul className="list-disc pl-5">{review.errors.map((message, i) => <li key={i}>{message}</li>)}</ul></AlertDescription></Alert>}
          {review.warnings.map((message, i) => <Alert key={i}><AlertDescription>{message}</AlertDescription></Alert>)}
          {skipped > 0 && <details><summary className="cursor-pointer font-medium">Skipped rows and duplicate warnings ({skipped})</summary><ul className="list-disc pl-5 text-sm">{review.rows.filter((r) => r.status === "skipped").map((r) => <li key={r.row}>Row {r.row} — {r.studentId || "no ID"}: {r.explanation}</li>)}</ul></details>}
          {review.newCharacteristics.length > 0 && <p className="text-sm">New characteristics to create: {review.newCharacteristics.join(", ")}.</p>}
          {!review.errors.length && review.count > 0 && <label className="flex gap-2 text-sm items-start"><Checkbox checked={confirmed} disabled={busy} onCheckedChange={(checked) => setConfirmed(checked === true)} /><span>I have reviewed the mappings, all row outcomes, skipped rows and new characteristics. Import only the {review.count} ready learners.</span></label>}
        </div>}
      </div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={handleClose}>Cancel</Button><Button disabled={busy || !review || !!review.errors.length || !review.count || !confirmed} onClick={() => void requestImport(false)} data-testid="button-confirm-import">{mode === "add" ? "Add New Learners" : "Update Existing Learners"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
