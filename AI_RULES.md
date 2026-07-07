# AI Rules

## Tech Stack
- React 18 with TypeScript for the frontend.
- Vite is the frontend build tool, with the app root in `client/`.
- Express with TypeScript powers the backend API and serves the production app.
- Wouter is used for client-side routing; keep route definitions in the client app entry/routing files.
- Tailwind CSS is the primary styling system, configured with shadcn/ui design tokens and CSS variables.
- shadcn/ui components built on Radix UI are the default UI component library.
- TanStack Query is used for server state, API data fetching, caching, and mutations.
- Drizzle ORM and Zod define shared schemas, validation, and database-ready types in `shared/`.
- PostgreSQL support is configured through Drizzle and `DATABASE_URL` when persistent storage is needed.

## Library and Architecture Rules
- Put client source code under `client/src/`; use `@/` imports for client modules.
- Put reusable UI components in `client/src/components/`; put shadcn/ui primitives in `client/src/components/ui/` and do not edit generated UI primitives unless necessary.
- Use Tailwind utility classes for layout, spacing, color, typography, responsive behavior, and component styling.
- Use shadcn/ui components first for buttons, dialogs, cards, forms, tables, tabs, dropdowns, tooltips, alerts, and similar UI patterns.
- Use Radix UI directly only when shadcn/ui does not provide the needed primitive.
- Use `lucide-react` for icons; keep icon usage simple, accessible, and consistent.
- Use React Hook Form with Zod validation for non-trivial forms and user input validation.
- Use TanStack Query for API-backed data instead of hand-rolled global loading/cache state.
- Keep shared types, Drizzle schemas, and Zod schemas in `shared/` so client and server stay type-safe.
- Put backend routes, storage, and server-only code under `server/`; never expose secrets or database credentials to client code.
- Follow the existing Material Design + Linear-inspired visual direction: clean, professional, data-first, accessible, and minimally animated.
- Prefer small, focused components and simple readable logic over broad abstractions or speculative extensibility.
