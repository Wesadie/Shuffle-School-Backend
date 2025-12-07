import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCheck, Plus, Trash2, User, Users, UserMinus } from "lucide-react";
import type { Student, Characteristic, Survey } from "@shared/schema";

const surveyFormSchema = z.object({
  teacherName: z.string().min(1, "Teacher name is required"),
  studentId: z.string().min(1, "Student is required"),
  notes: z.string().optional(),
});

type SurveyFormValues = z.infer<typeof surveyFormSchema>;

export default function SurveysPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [characteristicRatings, setCharacteristicRatings] = useState<Record<string, string>>({});
  const [pairWith, setPairWith] = useState<string[]>([]);
  const [separateFrom, setSeparateFrom] = useState<string[]>([]);

  const { data: surveys = [], isLoading: surveysLoading } = useQuery<Survey[]>({
    queryKey: ["/api/surveys"],
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const { data: characteristics = [] } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
  });

  const form = useForm<SurveyFormValues>({
    resolver: zodResolver(surveyFormSchema),
    defaultValues: {
      teacherName: "",
      studentId: "",
      notes: "",
    },
  });

  const createSurvey = useMutation({
    mutationFn: async (data: SurveyFormValues) => {
      return apiRequest("POST", "/api/surveys", {
        ...data,
        characteristicRatings,
        pairWith,
        separateFrom,
        submittedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      toast({ title: "Survey submitted successfully" });
      resetForm();
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to submit survey", variant: "destructive" });
    },
  });

  const deleteSurvey = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/surveys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      toast({ title: "Survey deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete survey", variant: "destructive" });
    },
  });

  const resetForm = () => {
    form.reset({
      teacherName: "",
      studentId: "",
      notes: "",
    });
    setCharacteristicRatings({});
    setPairWith([]);
    setSeparateFrom([]);
  };

  const onSubmit = (data: SurveyFormValues) => {
    createSurvey.mutate(data);
  };

  const getStudentName = (id: string) => {
    const student = students.find((s) => s.id === id);
    return student ? `${student.firstName} ${student.lastName}` : "Unknown Student";
  };

  const selectedStudentId = form.watch("studentId");
  const otherStudents = students.filter((s) => s.id !== selectedStudentId);

  const togglePairWith = (studentId: string) => {
    if (pairWith.includes(studentId)) {
      setPairWith(pairWith.filter((id) => id !== studentId));
    } else {
      setPairWith([...pairWith, studentId]);
      setSeparateFrom(separateFrom.filter((id) => id !== studentId));
    }
  };

  const toggleSeparateFrom = (studentId: string) => {
    if (separateFrom.includes(studentId)) {
      setSeparateFrom(separateFrom.filter((id) => id !== studentId));
    } else {
      setSeparateFrom([...separateFrom, studentId]);
      setPairWith(pairWith.filter((id) => id !== studentId));
    }
  };

  if (surveysLoading || studentsLoading) {
    return (
      <div className="p-6" data-testid="surveys-loading">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Teacher Surveys</h1>
          <p className="text-sm text-muted-foreground">
            Collect teacher input on student characteristics and pairing recommendations
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-survey" onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              New Survey
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Submit Teacher Survey</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 pr-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-4">
                  <FormField
                    control={form.control}
                    name="teacherName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teacher Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter your name"
                            {...field}
                            data-testid="input-teacher-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="studentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Student</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-student">
                              <SelectValue placeholder="Select a student" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {students.map((student) => (
                              <SelectItem key={student.id} value={student.id}>
                                {student.firstName} {student.lastName} - Grade {student.grade}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {characteristics.length > 0 && selectedStudentId && (
                    <div className="space-y-4">
                      <Label className="text-base font-medium">Characteristic Ratings</Label>
                      <div className="grid gap-4">
                        {characteristics.map((char) => (
                          <div key={char.id} className="space-y-2">
                            <Label>{char.name}</Label>
                            {char.type === "category" && char.options && char.options.length > 0 ? (
                              <Select
                                value={characteristicRatings[char.name] || ""}
                                onValueChange={(value) =>
                                  setCharacteristicRatings({
                                    ...characteristicRatings,
                                    [char.name]: value,
                                  })
                                }
                              >
                                <SelectTrigger data-testid={`select-char-${char.name}`}>
                                  <SelectValue placeholder={`Select ${char.name}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {char.options.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                placeholder={`Enter ${char.name} rating`}
                                value={characteristicRatings[char.name] || ""}
                                onChange={(e) =>
                                  setCharacteristicRatings({
                                    ...characteristicRatings,
                                    [char.name]: e.target.value,
                                  })
                                }
                                data-testid={`input-char-${char.name}`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedStudentId && otherStudents.length > 0 && (
                    <div className="space-y-4">
                      <Label className="text-base font-medium">Pairing Recommendations</Label>
                      <p className="text-sm text-muted-foreground">
                        Select students who should be paired with or separated from the selected student
                      </p>
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Student</TableHead>
                              <TableHead className="w-24 text-center">Pair With</TableHead>
                              <TableHead className="w-24 text-center">Separate</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {otherStudents.slice(0, 10).map((student) => (
                              <TableRow key={student.id}>
                                <TableCell>
                                  {student.firstName} {student.lastName}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={pairWith.includes(student.id)}
                                    onCheckedChange={() => togglePairWith(student.id)}
                                    data-testid={`checkbox-pair-${student.id}`}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={separateFrom.includes(student.id)}
                                    onCheckedChange={() => toggleSeparateFrom(student.id)}
                                    data-testid={`checkbox-separate-${student.id}`}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {otherStudents.length > 10 && (
                        <p className="text-xs text-muted-foreground">
                          Showing first 10 students. Filter by grade or search for more specific students.
                        </p>
                      )}
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Any additional observations or recommendations..."
                            {...field}
                            data-testid="textarea-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createSurvey.isPending} data-testid="button-submit-survey">
                      {createSurvey.isPending ? "Submitting..." : "Submit Survey"}
                    </Button>
                  </div>
                </form>
              </Form>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>

      {surveys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium" data-testid="text-no-surveys">No surveys yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mt-2">
              Teacher surveys help collect input on student characteristics and pairing recommendations
              to improve class placements.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submitted Surveys</CardTitle>
            <CardDescription>{surveys.length} survey(s) collected</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Ratings</TableHead>
                  <TableHead>Recommendations</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {surveys.map((survey) => (
                  <TableRow key={survey.id} data-testid={`row-survey-${survey.id}`}>
                    <TableCell className="font-medium">{survey.teacherName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {getStudentName(survey.studentId)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {Object.keys(survey.characteristicRatings || {}).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(survey.characteristicRatings || {}).slice(0, 2).map(([key, value]) => (
                            <Badge key={key} variant="secondary">
                              {key}: {value}
                            </Badge>
                          ))}
                          {Object.keys(survey.characteristicRatings || {}).length > 2 && (
                            <Badge variant="outline">
                              +{Object.keys(survey.characteristicRatings || {}).length - 2} more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No ratings</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {(survey.pairWith?.length || 0) > 0 && (
                          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <Users className="h-3 w-3" />
                            <span className="text-xs">{survey.pairWith?.length} pair</span>
                          </div>
                        )}
                        {(survey.separateFrom?.length || 0) > 0 && (
                          <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                            <UserMinus className="h-3 w-3" />
                            <span className="text-xs">{survey.separateFrom?.length} sep</span>
                          </div>
                        )}
                        {!(survey.pairWith?.length || 0) && !(survey.separateFrom?.length || 0) && (
                          <span className="text-muted-foreground text-sm">None</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(survey.submittedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteSurvey.mutate(survey.id)}
                        data-testid={`button-delete-survey-${survey.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
