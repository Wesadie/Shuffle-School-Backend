import { useState, useCallback } from "react";
import { Upload, FileText, AlertCircle, CheckCircle, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Characteristic } from "@shared/schema";

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characteristics: Pick<Characteristic, "name" | "type">[];
  importType?: "students" | "characteristics";
}

interface ParsedStudent {
  studentId?: string;
  firstName: string;
  lastName: string;
  grade: string;
  currentClass?: string;
  gender?: string;
  [key: string]: string | undefined;
}

interface ParsedCharacteristicRow {
  studentId?: string;
  firstName?: string;
  lastName?: string;
  grade?: string;
  currentClass?: string;
  gender?: string;
  characteristic: string;
  response: string;
  [key: string]: string | undefined;
}

function parseCsvRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiters = [";", ",", "\t"];
  const delimiter = delimiters.reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === delimiter && !inQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(value.trim());
      if (row.some((cell) => cell)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell)) rows.push(row);
  return rows;
}

export function CSVImportDialog({ open, onOpenChange, characteristics, importType = "students" }: CSVImportDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedStudent[] | ParsedCharacteristicRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const importMutation = useMutation({
    mutationFn: async (rows: ParsedStudent[] | ParsedCharacteristicRow[]) => {
      const response = await apiRequest(
        "POST",
        importType === "characteristics" ? "/api/students/bulk-import-characteristics" : "/api/students/bulk-import",
        { students: rows },
      );
      return await response.json() as { count: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      toast({
        title: importType === "characteristics" ? "Characteristic responses imported" : "Import successful",
        description: `${data.count} ${importType === "characteristics" ? "responses" : "students"} imported`,
      });
      handleClose();
    },
    onError: (error: Error) => {
      let description = error.message;
      const jsonStart = description.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const body = JSON.parse(description.slice(jsonStart)) as { error?: string; message?: string };
          description = body.error || body.message || description;
        } catch {
          // Keep the response text when the backend did not return JSON.
        }
      }
      toast({
        title: importType === "characteristics" ? "Failed to import characteristic responses" : "Failed to import students",
        description,
        variant: "destructive",
      });
    },
  });

  const parseCSV = (text: string): { headers: string[]; data: ParsedStudent[] | ParsedCharacteristicRow[] } => {
    const rows = parseCsvRows(text);
    if (rows.length === 0) {
      throw new Error("CSV must have a header row");
    }

    const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
    const characteristicByName = new Map(characteristics.map((characteristic) => [characteristic.name.toLowerCase(), characteristic]));

    if (importType === "characteristics") {
      const studentIdAliases = ["student id", "student_id", "id"];
      const mappedHeaders = headers.map((header) => {
        const lowerHeader = header.toLowerCase();
        if (lowerHeader === "student id" || studentIdAliases.includes(lowerHeader)) return "Student ID";
        return characteristicByName.get(lowerHeader)?.name || header;
      });
      if (!mappedHeaders.includes("Student ID")) {
        throw new Error(`Missing required column: Student ID. Found columns: ${headers.join(", ")}`);
      }

      const characteristicHeaders = mappedHeaders.filter((header) =>
        characteristicByName.has(header.toLowerCase()),
      );
      if (characteristicHeaders.length === 0) {
        throw new Error("The file must include at least one saved characteristic column.");
      }

      const data: ParsedCharacteristicRow[] = [];
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const values = rows[rowIndex];
        const row: Record<string, string> = {};
        mappedHeaders.forEach((header, index) => {
          row[header] = values[index]?.trim() || "";
        });
        if (!row["Student ID"]) continue;

        for (const characteristic of characteristicHeaders) {
          const response = row[characteristic];
          if (!response) continue;
          data.push({ studentId: row["Student ID"], characteristic, response });
        }
      }
      return { headers: mappedHeaders, data };
    }

    const requiredHeaders = ["Student ID", "First Name", "Last Name", "Gender", "Current Grade", "Current Class"];
    const altHeaders: Record<string, string[]> = {
      "Student ID": ["student id", "student_id", "id"],
      "First Name": ["first_name", "first name", "firstname", "first"],
      "Last Name": ["last_name", "last name", "lastname", "last"],
      Gender: ["gender", "sex"],
      "Current Grade": ["current grade", "current_grade", "grade", "grade_level", "gradelevel", "year"],
      "Current Class": ["current class", "current_class", "class"],
    };

    const mappedHeaders = headers.map((header) => {
      const lowerHeader = header.toLowerCase();
      for (const [standard, alternatives] of Object.entries(altHeaders)) {
        if (lowerHeader === standard.toLowerCase() || alternatives.includes(lowerHeader)) return standard;
      }
      return characteristicByName.get(lowerHeader)?.name || header;
    });

    const missingRequired = requiredHeaders.filter((required) => !mappedHeaders.includes(required));
    if (missingRequired.length > 0) {
      throw new Error(
        `Missing required columns: ${missingRequired.join(", ")}. Found columns: ${headers.join(", ")}`,
      );
    }

    const data: ParsedStudent[] = [];
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const values = rows[rowIndex];
      const row: Record<string, string> = {};
      mappedHeaders.forEach((header, index) => {
        row[header] = values[index]?.trim() || "";
      });

      if (!requiredHeaders.every((required) => row[required])) continue;

      for (const characteristic of characteristics) {
        const value = row[characteristic.name];
        if (!value || (characteristic.type !== "scale" && characteristic.type !== "percentage")) continue;
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          throw new Error(`Row ${rowIndex + 1}: ${characteristic.name} must be a numeric value.`);
        }
        if (characteristic.type === "percentage" && (numericValue < 0 || numericValue > 100)) {
          throw new Error(`Row ${rowIndex + 1}: ${characteristic.name} must be between 0 and 100.`);
        }
      }

      const extraValues = Object.fromEntries(
        Object.entries(row).filter(([header, value]) => !requiredHeaders.includes(header) && value !== ""),
      );
      data.push({
        studentId: row["Student ID"],
        firstName: row["First Name"],
        lastName: row["Last Name"],
        gender: row["Gender"],
        grade: row["Current Grade"],
        currentClass: row["Current Class"],
        ...extraValues,
      });
    }

    return { headers: mappedHeaders, data };
  };

  const handleFile = useCallback((file: File) => {
    setError(null);
    setParsedData([]);
    setHeaders([]);

    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }

    setFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const { headers, data } = parseCSV(text);
        setHeaders(headers);
        setParsedData(data);
      } catch (err: any) {
        setError(err.message || "Failed to parse CSV file");
      }
    };
    reader.onerror = () => {
      setError("Failed to read file");
    };
    reader.readAsText(file);
  }, [characteristics, importType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = () => {
    if (parsedData.length === 0) return;
    importMutation.mutate(parsedData);
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setError(null);
    onOpenChange(false);
  };

  const handleDownloadTemplate = () => {
    const templateHeaders =
      importType === "characteristics"
        ? ["Student ID", ...characteristics.map((characteristic) => characteristic.name)]
        : ["Student ID", "First Name", "Last Name", "Gender", "Current Grade", "Current Class", ...characteristics.map((characteristic) => characteristic.name)];
    const csvContent = `${templateHeaders.map((header) => `"${header.replace(/"/g, '""')}"`).join(";")}\r\n`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = importType === "characteristics" ? "student-characteristics-template.csv" : "student-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{importType === "characteristics" ? "Import Characteristic Responses" : "Import Students from CSV"}</DialogTitle>
          <DialogDescription>
            {importType === "characteristics"
              ? "Upload student characteristic responses, then review the parsed rows before importing."
              : "Upload student details and optional characteristic columns. Percentage characteristics accept numeric values from 0 to 100."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop your CSV file here, or
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileInput}
                    className="hidden"
                    data-testid="input-csv-file"
                  />
                  <Button variant="outline" asChild>
                    <span className="cursor-pointer">Browse Files</span>
                  </Button>
                </label>
                <Button
                  variant="ghost"
                  onClick={handleDownloadTemplate}
                  data-testid="button-download-template"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <FileText className="h-8 w-8 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setFile(null);
                    setParsedData([]);
                    setHeaders([]);
                    setError(null);
                  }}
                  data-testid="button-remove-file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {parsedData.length > 0 && (
                <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-700 dark:text-green-300">
                    Found {parsedData.length} valid {importType === "characteristics" ? "characteristic response" : "student"} records ready to import.
                  </AlertDescription>
                </Alert>
              )}

              {headers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Detected columns:</p>
                  <div className="flex flex-wrap gap-1">
                    {headers.map((h) => (
                      <Badge
                        key={h}
                        variant={[
                          "Student ID",
                          "First Name",
                          "Last Name",
                          "Gender",
                          "Current Grade",
                          "Current Class",
                          "Characteristic",
                          "Response",
                        ].includes(h) ? "default" : "secondary"}
                      >
                        {h}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsedData.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Preview (first 5 rows):</p>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            {importType === "characteristics" ? (
                              <>
                                <th className="px-3 py-2 text-left font-medium">Student ID</th>
                                <th className="px-3 py-2 text-left font-medium">Characteristic</th>
                                <th className="px-3 py-2 text-left font-medium">Response</th>
                              </>
                            ) : (
                              <>
                                <th className="px-3 py-2 text-left font-medium">Student ID</th>
                                <th className="px-3 py-2 text-left font-medium">First Name</th>
                                <th className="px-3 py-2 text-left font-medium">Last Name</th>
                                <th className="px-3 py-2 text-left font-medium">Gender</th>
                                <th className="px-3 py-2 text-left font-medium">Current Grade</th>
                                <th className="px-3 py-2 text-left font-medium">Current Class</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {parsedData.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-t">
                              {importType === "characteristics" ? (
                                <>
                                  <td className="px-3 py-2">{(row as ParsedCharacteristicRow).studentId || "—"}</td>
                                  <td className="px-3 py-2">{(row as ParsedCharacteristicRow).characteristic}</td>
                                  <td className="px-3 py-2">{(row as ParsedCharacteristicRow).response}</td>
                                </>
                              ) : (
                                <>
                                  <td className="px-3 py-2">{(row as ParsedStudent).studentId || "—"}</td>
                                  <td className="px-3 py-2">{(row as ParsedStudent).firstName}</td>
                                  <td className="px-3 py-2">{(row as ParsedStudent).lastName}</td>
                                  <td className="px-3 py-2">{(row as ParsedStudent).gender || "—"}</td>
                                  <td className="px-3 py-2">{(row as ParsedStudent).grade}</td>
                                  <td className="px-3 py-2">{(row as ParsedStudent).currentClass || "—"}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {parsedData.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      And {parsedData.length - 5} more rows...
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-import">
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={parsedData.length === 0 || importMutation.isPending}
            data-testid="button-confirm-import"
          >
            {importMutation.isPending ? "Importing..." : `Import ${parsedData.length} ${importType === "characteristics" ? "Rows" : "Students"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
