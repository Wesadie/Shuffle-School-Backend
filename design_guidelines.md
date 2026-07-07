# Design Guidelines: K-12 Class Placement Tool

## Design Approach

**System Selected**: Material Design + Linear-inspired patterns
**Rationale**: This is a utility-focused productivity application requiring clear data hierarchy, efficient workflows, and information-dense displays. Material Design provides robust patterns for data tables, forms, and status indicators, while Linear's clean aesthetic offers modern refinement for educational professionals.

## Core Design Principles

1. **Data-First Clarity**: Information hierarchy takes precedence over decoration
2. **Workflow Efficiency**: Multi-step process should feel seamless and intuitive
3. **Visual Feedback**: Real-time indicators for conflicts, balance, and validation
4. **Professional Restraint**: Clean, uncluttered interface that builds trust

## Typography

**Primary Font**: Inter (via Google Fonts CDN)
**Hierarchy**:
- Page Titles: text-3xl font-semibold
- Section Headers: text-xl font-semibold
- Subsections: text-lg font-medium
- Body Text: text-base font-normal
- Table Headers: text-sm font-semibold uppercase tracking-wide
- Captions/Labels: text-sm font-medium
- Helper Text: text-xs

## Layout System

**Spacing Units**: Use Tailwind spacing: 2, 3, 4, 6, 8, 12, 16, 20, 24
**Common Patterns**:
- Section padding: py-8 px-6 (mobile), py-12 px-8 (desktop)
- Card padding: p-6
- Component gaps: gap-4 (forms), gap-6 (sections)
- Table cell padding: px-4 py-3

**Container Structure**:
- Max width: max-w-7xl mx-auto for main content
- Sidebar: Fixed 280px width on desktop, collapsible on mobile
- Two-column layouts: 2/3 main content, 1/3 sidebar for details/actions

## Application Structure

### Main Layout
**Left Sidebar Navigation** (fixed):
- Dashboard
- Students (with count badge)
- Rules (Pairings & Separations)
- Characteristics
- Generate Classes
- Review & Adjust

**Top Bar**:
- School/Year selector (dropdown)
- Action buttons (Import, Export, Save)
- User profile menu

**Main Content Area**:
Full-width workspace with contextual content

### Key Application Screens

**1. Student Roster Management**
- Data table with sortable columns: Name, Current Class, Grade, Special Flags
- Inline editing capabilities
- Batch selection with checkboxes
- Floating action button for "Add Student"
- Import CSV with drag-drop zone (border-2 border-dashed with hover state)

**2. Rules Configuration**
Two-panel layout:
- Left: List of existing rules (card-based, each showing student names + rule type badge)
- Right: Add/Edit rule form with student search/autocomplete
- Visual tags for rule types (different subtle border treatments)

**3. Balance Characteristics**
- Horizontal card grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Each characteristic card shows: Name, Type, Distribution preview (simple bar chart)
- Add characteristic modal with form fields

**4. Class Generation & Review**
Split-screen layout:
- Left (60%): Generated class lists in columns (one per class)
- Right (40%): Balance indicators panel with progress bars and metrics
- Drag-and-drop interface with visual placeholder zones
- Conflict warnings appear as inline alerts with icon + message

## Component Library

### Data Tables
- Sticky headers with subtle shadow on scroll
- Alternating row backgrounds for readability
- Hover state on rows
- Sort indicators in column headers
- Pagination controls at bottom

### Cards
- Subtle border (border)
- Rounded corners (rounded-lg)
- Shadow on hover (hover:shadow-md transition)
- Consistent padding (p-6)

### Forms
- Label above input pattern
- Input height: h-10 for text inputs
- Focus ring on all interactive elements
- Inline validation messages below fields
- Required field indicators with asterisk

### Buttons
**Primary**: Full background, rounded-md, px-4 py-2
**Secondary**: Border with transparent background
**Tertiary**: Text-only with hover background
**Icon Buttons**: Square, p-2, rounded

### Status Indicators
- Small badges (text-xs px-2 py-1 rounded-full)
- Different treatments for: Conflict (warning), Balanced (success), Pending (neutral)
- Use iconography from Heroicons (outline style)

### Drag-and-Drop Elements
- Student cards: Compact design with grab handle icon
- Drop zones: Dashed border appears on drag-over
- Dragging state: Reduced opacity + lifted shadow
- Smooth transitions (transition-all duration-200)

### Balance Visualizations
- Horizontal bar charts showing distribution across classes
- Simple progress bars with percentage labels
- Color-coded status: Near-balanced vs. Imbalanced (using semantic meaning, not specific colors)

### Modals/Dialogs
- Centered overlay with backdrop blur
- Max width: max-w-2xl
- Close button in top-right
- Action buttons in footer (right-aligned)

## Navigation Patterns

**Multi-Step Workflow**:
- Horizontal stepper at top showing: Import → Rules → Characteristics → Generate → Review
- Active step highlighted, completed steps with checkmark
- Linear progression with "Next" and "Back" buttons

**Breadcrumbs**:
- For nested views (e.g., Students > Grade 3 > Edit Student)
- Small text with separator icons

## Animations

**Minimal, purposeful only**:
- Smooth transitions for drag-and-drop (duration-200)
- Subtle hover states on interactive elements
- Loading spinners for algorithm generation (single centered spinner)
- Modal fade-in/out
- NO complex animations, parallax, or decorative motion

## Accessibility

- All form inputs with proper labels and aria-labels
- Keyboard navigation for drag-and-drop (tab to select, arrow keys to move, enter to confirm)
- Focus indicators on all interactive elements (ring-2)
- High contrast text throughout
- Error messages with icons AND text

## Special Features

**Conflict Warning System**:
- Inline alerts with warning icon
- Specific message explaining the conflict
- Suggested resolution or manual override option

**Balance Meter**:
- Visual gauge showing overall class balance
- Breakdown by characteristic type
- Target ranges vs. current state

**Boost Feature** (if implemented):
- Prominent button in review interface
- Loading state during optimization
- Before/after comparison view

This design framework creates a professional, efficient tool that prioritizes educator workflows while maintaining visual clarity and modern polish.