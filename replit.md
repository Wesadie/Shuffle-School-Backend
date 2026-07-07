# ShuffleSchool - K-12 Class Placement Tool

## Overview

ShuffleSchool is a web-based K-12 class placement tool designed to help schools create balanced, optimized class lists. The application allows educators to import student data, define pairing and separation rules, configure student characteristics for balancing, and generate optimized class placements using an intelligent algorithm. The tool provides an intuitive review interface for manual adjustments before finalizing placements.

**Core Features:**
- Student data management with CSV import/export
- Pairing and separation rule configuration
- Characteristic-based class balancing (gender, academic levels, behavioral traits, etc.)
- Automated class generation with conflict detection
- Interactive review and adjustment interface
- Data visualization and balance metrics

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build Tool:**
- React 18+ with TypeScript
- Vite for development and production builds
- Wouter for client-side routing (lightweight alternative to React Router)

**UI Framework:**
- shadcn/ui components built on Radix UI primitives
- Material Design + Linear-inspired design patterns
- Tailwind CSS for styling with custom design tokens
- Inter font family for typography
- Theme support (light/dark mode) via context provider

**State Management:**
- TanStack Query (React Query) for server state management
- React hooks for local component state
- Query client configured with infinite stale time and disabled refetching

**Key Design Decisions:**
- **Component Library**: shadcn/ui chosen for customizability and direct component ownership (components are copied into the project rather than imported as dependencies)
- **Routing**: Wouter selected for minimal bundle size and simple API
- **Data Fetching**: TanStack Query provides caching, background updates, and optimistic updates out of the box
- **Styling Approach**: Utility-first with Tailwind CSS, using CSS variables for theme consistency

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript
- HTTP server created via Node's `http` module
- Middleware for JSON parsing, URL encoding, and request logging

**API Design:**
- RESTful API endpoints following resource-based patterns
- Standard CRUD operations for all entities (Students, Rules, Characteristics, Class Configs, Placements)
- Zod schemas for runtime validation
- Error handling with appropriate HTTP status codes

**Data Layer:**
- In-memory storage implementation (`server/storage.ts`) defining the storage interface
- Database-agnostic storage interface allows easy swapping of implementations
- Schema definitions in `shared/schema.ts` using Drizzle ORM syntax

**Key Architectural Patterns:**
- **Repository Pattern**: Storage interface abstracts data access
- **Shared Types**: Schema definitions shared between client and server via `@shared` path alias
- **Validation Layer**: Zod schemas provide type safety and runtime validation
- **Separation of Concerns**: Routes, storage, and business logic are separated

### Data Model

**Core Entities:**

1. **Students**
   - Basic info: firstName, lastName, grade, currentClass, gender
   - Flexible characteristics stored as JSON object
   - Notes field for additional context

2. **Rules** (Pairing/Separation)
   - Type: "pair" or "separate"
   - References two student IDs
   - Optional reason field

3. **Characteristics**
   - Name and type (category or scale)
   - Options array for category types
   - Priority for balancing algorithm

4. **Class Configurations**
   - Name, grade, capacity
   - References to configured characteristics and rules

5. **Placements**
   - Links students to specific class configurations
   - Supports manual adjustments after generation

**Schema Management:**
- Drizzle ORM for schema definition and type inference
- `createInsertSchema` from drizzle-zod for automatic validation schemas
- TypeScript types inferred directly from database schema

### Build & Deployment

**Development:**
- Vite dev server with HMR for client
- tsx for running TypeScript server with hot reload
- Concurrent development of client and server

**Production Build:**
- Custom build script (`script/build.ts`)
- Vite builds client to `dist/public`
- esbuild bundles server to single `dist/index.cjs` file
- Selective bundling: frequently-used dependencies bundled, others externalized
- Build optimization reduces cold start times by minimizing file I/O

**Path Aliases:**
- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

### External Dependencies

**Frontend Libraries:**
- **@tanstack/react-query**: Server state management and caching
- **@radix-ui/***: Headless UI primitives (dialogs, dropdowns, tooltips, etc.)
- **wouter**: Lightweight client-side routing
- **react-hook-form + @hookform/resolvers**: Form management with Zod validation
- **class-variance-authority + clsx**: Utility for managing conditional className logic
- **cmdk**: Command palette component
- **embla-carousel-react**: Carousel/slider component
- **date-fns**: Date manipulation utilities
- **lucide-react**: Icon library

**Backend Libraries:**
- **express**: Web application framework
- **drizzle-orm**: TypeScript ORM with type-safe queries
- **drizzle-zod**: Zod schema generation from Drizzle schemas
- **zod**: Runtime type validation
- **pg**: PostgreSQL client (prepared for database integration)
- **connect-pg-simple**: PostgreSQL session store for express-session

**Development Tools:**
- **vite**: Frontend build tool and dev server
- **tsx**: TypeScript execution for Node.js
- **esbuild**: Fast JavaScript bundler for server build
- **drizzle-kit**: Schema management and migrations
- **@replit/vite-plugin-***: Replit-specific development enhancements

**Database:**
- PostgreSQL configured via Drizzle ORM
- Connection via `DATABASE_URL` environment variable
- Migrations output to `./migrations` directory

**Styling & Design:**
- **tailwindcss**: Utility-first CSS framework
- **autoprefixer**: PostCSS plugin for vendor prefixes
- **Google Fonts**: Inter font family served via CDN
- Custom CSS variables for theme colors and design tokens