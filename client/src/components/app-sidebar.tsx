import { useLocation, Link } from "wouter";
import { Users, Link2, Sliders, Sparkles, ClipboardList, Download, Upload, ClipboardCheck, Network, Layers, GraduationCap } from "lucide-react";
import logoImage from "@assets/ChatGPT_Image_Dec_8,_2025,_01_03_50_PM_1765191843507.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AppSidebarProps {
  studentCount: number;
  onImport: () => void;
  onExport: () => void;
}

const navItems = [
  {
    title: "Students",
    url: "/",
    icon: Users,
    showCount: true,
  },
  {
    title: "Teachers",
    url: "/teachers",
    icon: GraduationCap,
  },
  {
    title: "Rules",
    url: "/rules",
    icon: Link2,
    description: "Pairings & Separations",
  },
  {
    title: "Characteristics",
    url: "/characteristics",
    icon: Sliders,
  },
  {
    title: "Teacher Surveys",
    url: "/surveys",
    icon: ClipboardCheck,
  },
  {
    title: "Generate Classes",
    url: "/generate",
    icon: Sparkles,
  },
  {
    title: "Review & Adjust",
    url: "/review",
    icon: ClipboardList,
  },
  {
    title: "Sociogram",
    url: "/sociogram",
    icon: Network,
    description: "Visual student network",
  },
  {
    title: "Scenarios",
    url: "/scenarios",
    icon: Layers,
    description: "Compare placements",
  },
];

export function AppSidebar({ studentCount, onImport, onExport }: AppSidebarProps) {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src={logoImage} alt="ShuffleSchool Logo" className="h-8 w-8 rounded-md object-contain" />
          <div className="flex flex-col">
            <span className="text-lg font-semibold">ShuffleSchool</span>
            <span className="text-xs text-muted-foreground">Class Placement Tool</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={isActive ? "bg-sidebar-accent" : ""}
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {item.showCount && studentCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {studentCount}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Actions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onImport} data-testid="button-import-csv">
                  <Upload className="h-4 w-4" />
                  <span>Import CSV</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onExport} data-testid="button-export-csv">
                  <Download className="h-4 w-4" />
                  <span>Export Results</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="text-xs text-muted-foreground text-center">
          Powered by intelligent balancing
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
