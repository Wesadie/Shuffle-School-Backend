import { useState } from "react";
import { Upload, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LearnerColumnMapping } from "@/components/learner-column-mapping";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { readLearnerSpreadsheet, type LearnerSheet } from "@/lib/learner-spreadsheet";
import { learnerFields, recognizeColumn, columnMappingLabel, columnMappingErrors, characteristicImportError, type ImportColumn, type ImportReview } from "@shared/learner-import";
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
  const [sheetMappings, setSheetMappings] = useState<Record<number, ImportColumn[]>>({});
  const [step, setStep] = useState<"mapping" | "review">("mapping");
  const [mode, setMode] = useState<"add" | "update">(importType === "characteristics" ? "update" : "add");
  const [review, setReview] = useState<ImportReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [page, setPage] = useState(0);
  const sheet = sheets[sheetIndex];
  const rows = sheet?.rows.slice(1) || [];
  const mappingErrors = columnMappingErrors(columns, mode);
  const ignored = columns.map((column, index) => ({ column, index })).filter(({ column }) => column.kind === "ignore");
  const resetReview = () => { setReview(null); setConfirmed(false); setError(null); setStep("mapping"); };
  const selectSheet = (index: number, source = sheets) => {
    setSheetIndex(index);
    const raw = source[index]?.rows || [];
    const width = Math.max(0, ...raw.map((row) => row.length));
    const saved = source === sheets ? sheetMappings[index] : undefined;
    const next = saved || Array.from({ length: width }, (_, i) => recognizeColumn(raw[0]?.[i] || "", characteristics));
    setColumns(next);
    setSheetMappings((current) => ({ ...current, [index]: next }));
    setPage(0); resetReview();
  };
  const removeFile = () => { setFile(null); setSheets([]); setColumns([]); setSheetMappings({}); setPage(0); resetReview(); };
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
    const next = columns.map((column, i) => i === index ? { ...column, ...changes } : column);
    setColumns(next);
    setSheetMappings((current) => ({ ...current, [sheetIndex]: next }));
    resetReview();
  };
  const requestImport = async (preview: boolean) => {
    setBusy(true); setError(null);
    try {
      const response = await apiRequest("POST", "/api/students/bulk-import", { mode, columns, rows, preview, reviewedRevision: preview ? undefined : review?.revision });
      const result = await response.json() as ImportReview & { added?: number; updated?: number };
      setReview(result); setConfirmed(false); setStep("review");
      if (!preview) {
        queryClient.invalidateQueries({ queryKey: ["/api/students"] });
        queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
        toast({ title: "Import complete", description: `${result.added || 0} added · ${result.updated || 0} updated · ${result.rows.filter((row) => row.status === "skipped").length} skipped. Placements and teacher allocations unchanged.` });
        setFile(null); setSheets([]); setColumns([]); setSheetMappings({}); setReview(null); setStep("mapping"); onOpenChange(false);
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
        <DialogDescription>Upload your spreadsheet, save column mappings, then review before importing. No data is written during mapping or validation.</DialogDescription>
      </DialogHeader>
      <ol className="flex flex-wrap gap-3 text-sm" aria-label="Import steps">
        <li className={!columns.length ? "font-semibold text-primary" : "text-muted-foreground"} aria-current={!columns.length ? "step" : undefined}>1. Upload</li>
        <li className={columns.length && step === "mapping" ? "font-semibold text-primary" : "text-muted-foreground"} aria-current={columns.length && step === "mapping" ? "step" : undefined}>2. Column Mapping</li>
        <li className={columns.length && step === "review" ? "font-semibold text-primary" : "text-muted-foreground"} aria-current={columns.length && step === "review" ? "step" : undefined}>3. Review & Import</li>
      </ol>
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
          {step === "mapping" ? <div className="space-y-3">
            <h3 className="font-medium">Column Mapping</h3>
            <p className="text-sm text-muted-foreground">Matching headings are suggested automatically. Choose a learner field, saved characteristic, new characteristic or Ignore for every column. Numerical cells do not need special Excel formatting.</p>
            <p className="text-xs text-muted-foreground">Mappings are kept for each worksheet in this upload and shared by Add New Learners and Update Existing Learners. Switching modes never resets your choices.</p>
            <LearnerColumnMapping columns={columns} characteristics={characteristics} disabled={busy} mode={mode} onChange={updateColumn} />
            {!!mappingErrors.length && <Alert variant="destructive"><AlertDescription><ul className="list-disc pl-5">{mappingErrors.map((message, i) => <li key={i}>{message}</li>)}</ul></AlertDescription></Alert>}
            {!!ignored.length && <Alert><AlertDescription><p>Explicitly ignored columns — values will not be imported:</p><ul className="list-disc pl-5">{ignored.map(({ column, index }) => <li key={index}>Column {index + 1}: {column.heading || "no heading"} ({rows.filter((cells) => cells[index]?.trim()).length} non-blank values)</li>)}</ul></AlertDescription></Alert>}
          </div> : <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-medium">Mappings saved for this worksheet</h3><p className="text-sm text-muted-foreground">{columns.length - ignored.length} mapped · {ignored.length} explicitly ignored. Review the outcomes below before confirming.</p></div>
            <Button variant="outline" disabled={busy} onClick={resetReview}>Edit Column Mappings</Button>
          </div>}
          <h3 className="font-medium">Live mapped preview — {rows.length} rows, all {columns.length} spreadsheet columns</h3>
          <p className="text-xs text-muted-foreground">Column headings show spreadsheet heading → import destination. Original values, including ignored values, remain visible. Percentage marks use 0–100; blank update cells preserve saved values.</p>
          <div className="border rounded-lg overflow-auto max-h-80">
            <table className="text-sm w-full"><thead className="bg-muted"><tr><th className="p-2 text-left">Spreadsheet row</th>{columns.map((c, i) => <th key={i} className="p-2 text-left min-w-40"><span className="block">{c.heading || `(Column ${i + 1})`}</span><span className="block text-xs font-normal text-muted-foreground">→ {columnMappingLabel(c)}{mode === "update" && c.kind === "field" && c.target !== "studentId" ? " (read-only)" : ""}</span></th>)}<th className="p-2 text-left">Validation / outcome</th></tr></thead>
              <tbody>{rows.slice(page * 50, (page + 1) * 50).map((cells, i) => {
                const index = page * 50 + i, result = review?.rows[index];
                return <tr key={index} className="border-t"><td className="p-2">{index + 2}</td>{columns.map((column, c) => {
                  const type = column.create ? column.type : characteristics.find((saved) => saved.name === column.target)?.type;
                  const invalid = column.kind === "characteristic" ? characteristicImportError(cells[c] || "", type) : null;
                  return <td key={c} className={`p-2 whitespace-pre-wrap min-w-28 ${invalid ? "text-destructive" : column.kind === "ignore" ? "text-muted-foreground bg-muted/30" : ""}`}>{cells[c] ?? ""}{invalid && <span className="block text-xs">{invalid}</span>}</td>;
                })}<td className={`p-2 min-w-64 ${result?.status === "error" ? "text-destructive" : ""}`}>{result ? `${result.status}: ${result.explanation}` : "Not yet validated"}</td></tr>;
              })}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Rows {rows.length ? page * 50 + 1 : 0}–{Math.min((page + 1) * 50, rows.length)} of {rows.length}. Every row is available for review.</span><div className="flex gap-2"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={(page + 1) * 50 >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div></div>
        </>}
        {step === "review" && review && <div className="space-y-3" aria-live="polite">
          <p className="font-medium">{review.count} ready to {mode === "add" ? "add" : "update"} · {skipped} skipped · {review.rows.filter((r) => r.status === "error").length} invalid rows</p>
          {review.errors.length > 0 && <Alert variant="destructive"><AlertDescription><p>No data will be changed until all errors are resolved.</p><ul className="list-disc pl-5">{review.errors.map((message, i) => <li key={i}>{message}</li>)}</ul></AlertDescription></Alert>}
          {review.warnings.map((message, i) => <Alert key={i}><AlertDescription>{message}</AlertDescription></Alert>)}
          {skipped > 0 && <details><summary className="cursor-pointer font-medium">Skipped rows and duplicate warnings ({skipped})</summary><ul className="list-disc pl-5 text-sm">{review.rows.filter((r) => r.status === "skipped").map((r) => <li key={r.row}>Row {r.row} — {r.studentId || "no ID"}: {r.explanation}</li>)}</ul></details>}
          {review.newCharacteristics.length > 0 && <p className="text-sm">New characteristics to create: {review.newCharacteristics.join(", ")}.</p>}
          {!review.errors.length && review.count > 0 && <label className="flex gap-2 text-sm items-start"><Checkbox checked={confirmed} disabled={busy} onCheckedChange={(checked) => setConfirmed(checked === true)} /><span>I have reviewed the saved mappings, ignored columns and their values, all row outcomes, skipped rows and new characteristics. Import only the {review.count} ready learners.</span></label>}
        </div>}
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={handleClose}>Cancel</Button>
        {!!columns.length && (step === "mapping"
          ? <Button disabled={busy || !rows.length || !!mappingErrors.length} onClick={() => void requestImport(true)} data-testid="button-save-column-mappings">Save Mappings & Review</Button>
          : <Button disabled={busy || !review || !!review.errors.length || !review.count || !confirmed} onClick={() => void requestImport(false)} data-testid="button-confirm-import">{mode === "add" ? "Add New Learners" : "Update Existing Learners"}</Button>)}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
