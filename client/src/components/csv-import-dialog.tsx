import { useState, useCallback } from "react";
import { Upload, FileText, AlertCircle, CheckCircle, X } from "lucide-react";
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

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedStudent {
  firstName: string;
  lastName: string;
  grade: string;
  currentClass?: string;
  gender?: string;
  notes?: string;
  [key: string]: string | undefined;
}

export function CSVImportDialog({ open, onOpenChange }: CSVImportDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedStudent[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const importMutation = useMutation({
    mutationFn: (students: ParsedStudent[]) => 
      apiRequest("POST", "/api/students/bulk-import", { students }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      toast({ 
        title: "Import successful", 
        description: `${data.count || parsedData.length} students imported` 
      });
      handleClose();
    },
    onError: () => {
      toast({ title: "Failed to import students", variant: "destructive" });
    },
  });

  const parseCSV = (text: string): { headers: string[]; data: ParsedStudent[] } => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) {
      throw new Error("CSV must have a header row and at least one data row");
    }

    const headerLine = lines[0];
    const headers = headerLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

    const requiredHeaders = ["firstName", "lastName", "grade"];
    const altHeaders: Record<string, string[]> = {
      firstName: ["first_name", "first name", "firstname", "first"],
      lastName: ["last_name", "last name", "lastname", "last"],
      grade: ["grade", "grade_level", "gradelevel", "year"],
    };

    const headerMap: Record<string, string> = {};
    headers.forEach((h) => {
      const lowerH = h.toLowerCase();
      for (const [standard, alternatives] of Object.entries(altHeaders)) {
        if (lowerH === standard.toLowerCase() || alternatives.includes(lowerH)) {
          headerMap[h] = standard;
        }
      }
      if (!headerMap[h]) {
        headerMap[h] = h;
      }
    });

    const missingRequired = requiredHeaders.filter(
      (req) => !Object.values(headerMap).includes(req)
    );
    if (missingRequired.length > 0) {
      throw new Error(
        `Missing required columns: ${missingRequired.join(", ")}. ` +
        `Found columns: ${headers.join(", ")}`
      );
    }

    const data: ParsedStudent[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        const standardKey = headerMap[header];
        row[standardKey] = values[idx]?.replace(/^"|"$/g, "") || "";
      });

      if (row.firstName && row.lastName && row.grade) {
        data.push(row as ParsedStudent);
      }
    }

    return { headers: Object.values(headerMap), data };
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
  }, []);

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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Students from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with student data. Required columns: firstName, lastName, grade.
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
                    Found {parsedData.length} valid student records ready to import.
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
                        variant={["firstName", "lastName", "grade"].includes(h) ? "default" : "secondary"}
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
                            <th className="px-3 py-2 text-left font-medium">First Name</th>
                            <th className="px-3 py-2 text-left font-medium">Last Name</th>
                            <th className="px-3 py-2 text-left font-medium">Grade</th>
                            <th className="px-3 py-2 text-left font-medium">Gender</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedData.slice(0, 5).map((student, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">{student.firstName}</td>
                              <td className="px-3 py-2">{student.lastName}</td>
                              <td className="px-3 py-2">{student.grade}</td>
                              <td className="px-3 py-2">{student.gender || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {parsedData.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      And {parsedData.length - 5} more students...
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
            {importMutation.isPending ? "Importing..." : `Import ${parsedData.length} Students`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
