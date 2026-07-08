import { BookOpen, Clock, PlayCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Tutorial = {
  title: string;
  description: string;
  category: string;
  sortOrder: number;
  videoUrl?: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  duration?: string;
};

const tutorials: Tutorial[] = [
  {
    title: "Getting Started",
    description: "Learn the recommended first steps for setting up ShuffleSchool.",
    category: "Getting Started",
    sortOrder: 1,
  },
  {
    title: "Managing Students",
    description: "Prepare, import, review, and maintain learner information.",
    category: "Managing Students",
    sortOrder: 2,
  },
  {
    title: "Managing Teachers",
    description: "Add teacher records and connect teaching context to class setup.",
    category: "Managing Teachers",
    sortOrder: 3,
  },
  {
    title: "Requests and Preferences",
    description: "Capture placement requests, separation requests, and learner requirements.",
    category: "Requests and Preferences",
    sortOrder: 4,
  },
  {
    title: "Characteristics and Balancing",
    description: "Configure the characteristics ShuffleSchool uses to create balanced classes.",
    category: "Characteristics and Balancing",
    sortOrder: 5,
  },
  {
    title: "Setting Up Classes",
    description: "Create the target classes, capacities, and grade structure for the solver.",
    category: "Setting Up Classes",
    sortOrder: 6,
  },
  {
    title: "Using the Solver",
    description: "Run the solver and understand how generated placements are created.",
    category: "Using the Solver",
    sortOrder: 7,
  },
  {
    title: "Reviewing and Adjusting Results",
    description: "Review class lists and make adjustments before finalising placements.",
    category: "Reviewing and Adjusting Results",
    sortOrder: 8,
  },
  {
    title: "Exporting Class Lists",
    description: "Export finished class lists for sharing and school administration.",
    category: "Exporting Class Lists",
    sortOrder: 9,
  },
];

export default function TutorialsPage() {
  const sortedTutorials = [...tutorials].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Tutorials</h1>
        <p className="text-muted-foreground max-w-3xl">
          Learn how to use ShuffleSchool, from importing your first student list to creating balanced classes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sortedTutorials.map((tutorial) => (
          <Card key={tutorial.category} className="overflow-hidden">
            <div className="flex aspect-video items-center justify-center border-b bg-muted/40">
              {tutorial.thumbnailUrl ? (
                <img src={tutorial.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <PlayCircle className="h-10 w-10" />
                  <span className="text-sm font-medium">Tutorial coming soon</span>
                </div>
              )}
            </div>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{tutorial.title}</CardTitle>
                  <CardDescription>{tutorial.description}</CardDescription>
                </div>
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <BookOpen className="h-4 w-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <Badge variant="outline">{tutorial.category}</Badge>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {tutorial.duration || "Duration coming soon"}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
