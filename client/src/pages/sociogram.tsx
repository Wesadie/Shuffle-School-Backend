import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, RotateCcw, Network } from "lucide-react";
import type { Student, Rule, Placement, ClassConfig } from "@shared/schema";

interface Node {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gender?: string | null;
}

interface Edge {
  source: string;
  target: string;
  type: "pair" | "separate";
}

export default function SociogramPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [zoom, setZoom] = useState(1);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const animationRef = useRef<number | null>(null);

  const { data: students = [], isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const { data: rules = [] } = useQuery<Rule[]>({
    queryKey: ["/api/rules"],
  });

  const { data: placements = [] } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
  });

  const { data: classConfigs = [] } = useQuery<ClassConfig[]>({
    queryKey: ["/api/class-configs"],
  });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(rect.width - 32, 400),
          height: Math.max(rect.height - 16, 400),
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const initializeGraph = useCallback(() => {
    let filteredStudents = students;
    let filteredRules = rules;

    if (selectedClass !== "all" && placements.length > 0) {
      const studentIdsInClass = new Set(
        placements.filter((p) => p.classId === selectedClass).map((p) => p.studentId)
      );
      filteredStudents = students.filter((s) => studentIdsInClass.has(s.id));
      filteredRules = rules.filter(
        (r) => studentIdsInClass.has(r.studentId1) || studentIdsInClass.has(r.studentId2)
      );
    }

    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const radius = Math.min(dimensions.width, dimensions.height) * 0.35;

    const newNodes: Node[] = filteredStudents.map((student, index) => {
      const angle = (index / filteredStudents.length) * Math.PI * 2;
      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        x: centerX + radius * Math.cos(angle) + (Math.random() - 0.5) * 50,
        y: centerY + radius * Math.sin(angle) + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        gender: student.gender,
      };
    });

    const studentIdSet = new Set(filteredStudents.map((s) => s.id));
    const newEdges: Edge[] = filteredRules
      .filter((rule) => studentIdSet.has(rule.studentId1) && studentIdSet.has(rule.studentId2))
      .map((rule) => ({
        source: rule.studentId1,
        target: rule.studentId2,
        type: rule.type as "pair" | "separate",
      }));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [students, rules, placements, selectedClass, dimensions]);

  useEffect(() => {
    initializeGraph();
  }, [initializeGraph]);

  useEffect(() => {
    if (nodes.length === 0) return;

    const simulate = () => {
      const newNodes = [...nodes];
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;

      for (let i = 0; i < newNodes.length; i++) {
        let fx = 0;
        let fy = 0;

        for (let j = 0; j < newNodes.length; j++) {
          if (i === j) continue;
          const dx = newNodes[i].x - newNodes[j].x;
          const dy = newNodes[i].y - newNodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const repulsion = 5000 / (dist * dist);
          fx += (dx / dist) * repulsion;
          fy += (dy / dist) * repulsion;
        }

        for (const edge of edges) {
          if (edge.source === newNodes[i].id || edge.target === newNodes[i].id) {
            const otherId = edge.source === newNodes[i].id ? edge.target : edge.source;
            const other = newNodes.find((n) => n.id === otherId);
            if (!other) continue;

            const dx = other.x - newNodes[i].x;
            const dy = other.y - newNodes[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            if (edge.type === "pair") {
              const attraction = (dist - 100) * 0.05;
              fx += (dx / dist) * attraction;
              fy += (dy / dist) * attraction;
            } else {
              const repulsion = 3000 / (dist * dist);
              fx -= (dx / dist) * repulsion;
              fy -= (dy / dist) * repulsion;
            }
          }
        }

        const dcx = centerX - newNodes[i].x;
        const dcy = centerY - newNodes[i].y;
        fx += dcx * 0.001;
        fy += dcy * 0.001;

        newNodes[i].vx = (newNodes[i].vx + fx) * 0.85;
        newNodes[i].vy = (newNodes[i].vy + fy) * 0.85;
        newNodes[i].x += newNodes[i].vx;
        newNodes[i].y += newNodes[i].vy;

        const padding = 30;
        newNodes[i].x = Math.max(padding, Math.min(dimensions.width - padding, newNodes[i].x));
        newNodes[i].y = Math.max(padding, Math.min(dimensions.height - padding, newNodes[i].y));
      }

      setNodes(newNodes);
      animationRef.current = requestAnimationFrame(simulate);
    };

    const timeout = setTimeout(() => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }, 5000);

    animationRef.current = requestAnimationFrame(simulate);

    return () => {
      clearTimeout(timeout);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes.length, edges, dimensions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    ctx.save();
    ctx.translate(dimensions.width / 2, dimensions.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-dimensions.width / 2, -dimensions.height / 2);

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      if (edge.type === "pair") {
        ctx.strokeStyle = "rgba(34, 197, 94, 0.6)";
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);

      const isHovered = hoveredNode?.id === node.id;
      if (node.gender === "female" || node.gender === "F") {
        ctx.fillStyle = isHovered ? "rgba(244, 114, 182, 1)" : "rgba(244, 114, 182, 0.8)";
      } else if (node.gender === "male" || node.gender === "M") {
        ctx.fillStyle = isHovered ? "rgba(96, 165, 250, 1)" : "rgba(96, 165, 250, 0.8)";
      } else {
        ctx.fillStyle = isHovered ? "rgba(168, 162, 158, 1)" : "rgba(168, 162, 158, 0.8)";
      }
      ctx.fill();

      ctx.strokeStyle = isHovered ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const initials = node.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
      ctx.fillText(initials, node.x, node.y);

      if (isHovered) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        const textWidth = ctx.measureText(node.name).width + 16;
        ctx.fillRect(node.x - textWidth / 2, node.y - 45, textWidth, 20);
        ctx.fillStyle = "#fff";
        ctx.font = "12px Inter, sans-serif";
        ctx.fillText(node.name, node.x, node.y - 35);
      }
    }

    ctx.restore();
  }, [nodes, edges, zoom, hoveredNode, dimensions]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - dimensions.width / 2) / zoom + dimensions.width / 2;
    const y = (e.clientY - rect.top - dimensions.height / 2) / zoom + dimensions.height / 2;

    const hovered = nodes.find((node) => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 20;
    });

    setHoveredNode(hovered || null);
  };

  const handleReset = () => {
    setZoom(1);
    initializeGraph();
  };

  const pairCount = edges.filter((e) => e.type === "pair").length;
  const separateCount = edges.filter((e) => e.type === "separate").length;

  if (studentsLoading) {
    return (
      <div className="p-6" data-testid="sociogram-loading">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Visual Sociogram
          </h1>
          <p className="text-sm text-muted-foreground">
            Network visualization of student relationships and connections
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-48" data-testid="select-class-filter">
              <SelectValue placeholder="Filter by class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Students</SelectItem>
              {classConfigs.map((config) => (
                <SelectItem key={config.id} value={config.id}>
                  {config.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={handleReset}
              data-testid="button-reset-view"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-pink-400"></div>
          <span className="text-sm text-muted-foreground">Female</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-400"></div>
          <span className="text-sm text-muted-foreground">Male</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-stone-400"></div>
          <span className="text-sm text-muted-foreground">Other</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-green-500"></div>
          <span className="text-sm text-muted-foreground">Pair</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-red-400 border-dashed border-t"></div>
          <span className="text-sm text-muted-foreground">Separate</span>
        </div>
      </div>

      <Card className="flex-1 min-h-0">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-lg">Relationship Network</CardTitle>
              <CardDescription>
                {nodes.length} students with {pairCount + separateCount} connections
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {pairCount} pair rules
              </Badge>
              <Badge variant="outline">
                {separateCount} separate rules
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-4" ref={containerRef}>
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
              <Network className="h-12 w-12 mb-4" />
              <h3 className="text-lg font-medium" data-testid="text-no-data">No data to display</h3>
              <p className="text-sm text-center max-w-md mt-2">
                Add students and create pairing/separation rules to see the relationship network
              </p>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: hoveredNode ? "pointer" : "default" }}
              data-testid="canvas-sociogram"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
