# Coding Agent Guidelines

Follow established patterns in neighboring code. Make the smallest correct change and do not introduce new abstractions, dependencies, or conventions without a concrete need.

## Documentation

- Update relevant content or setup documentation when user-facing behavior changes.

## Structure And Imports

- The web app is in `apps/web`; shared backend code is in `packages`; shared configuration is in `config` and `tooling`.
- Use package exports and configured aliases (`@repo/*`, `@shared/*`, `@saas/*`, `@marketing/*`, `@ui/*`, `@analytics`, `@i18n`) rather than deep relative imports.
- Keep route-specific code near its route and cross-route code in the appropriate module or package.

## Code Conventions

- Write strict TypeScript. Prefer interfaces for object shapes, union literals or records over enums, and avoid unjustified `any`.
- Use named function components and named exports. Avoid default exports and classes unless the surrounding code requires them.
- Use camelCase for variables and functions, PascalCase for components and types, and SCREAMING_SNAKE_CASE for constants.
- Prefer clear, pure functions and small, focused files. Inspect neighboring code before choosing a pattern.

## React And Next.js

- Default to React Server Components. Add `"use client"` only for browser APIs or local interactivity, and keep client boundaries small.
- Use server-side data fetching, route handlers, server actions, and established caching/revalidation patterns. Do not add client-side fetching or state when server rendering suffices.
- Use `notFound()`, `redirect()`, and error boundaries for expected navigation and error states.
- Use `next/image` with dimensions for images and preserve responsive, mobile-first styling.

## Data, Auth, And APIs

- Define API procedures in `packages/api/modules` with route metadata, Zod input validation, appropriate middleware, and a handler.
- Use generated clients and query helpers from `@repo/database`; keep database queries in the database package. Do not instantiate an ORM client in app code.
- Use auth helpers from `@repo/auth` and preserve organization scoping and authorization checks for multi-tenant features.
- Reuse Zod schemas between API and forms when appropriate. Use React Hook Form and existing form components for new forms.

## UI, i18n, And Analytics

- Use components from `@ui/components`, Radix primitives where needed, `cn` for conditional classes, and existing Tailwind design tokens.
- Add translations for user-facing strings and honor configured locale handling.
- Use the `@analytics` abstraction for tracking. Do not call provider SDKs directly from feature code.

## Security And Configuration

- Read application settings through `@repo/config`.
- Keep server-only environment variables unprefixed; use `NEXT_PUBLIC_` only for intentional client exposure.
- Never commit secrets or hard-code credentials.

## Quality Checks

- Use `pnpm` and workspace scripts. Run the narrowest relevant checks, then broader checks when warranted: `pnpm lint`, `pnpm format`, `pnpm test`, or `pnpm build`.
- Keep changes Biome-clean and add or update tests when behavior changes.
- Before completing work, verify types, authorization, translations, accessibility, responsive behavior, and affected documentation.
