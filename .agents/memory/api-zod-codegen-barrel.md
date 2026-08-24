---
name: API Zod codegen barrel collision
description: Preventing TypeScript name collisions between generated Zod schemas and generated request-body types.
---

**Rule:** When generated runtime Zod schemas and generated TypeScript request-body types share an operation name, export only the non-conflicting types from the package barrel.

**Why:** The current OpenAPI generator emits both a runtime schema and a type with the same identifier; wildcard re-exports make the composite TypeScript build fail even though each generated file is valid.

Concretely: every `orval` run appends `export * from './generated/types';` to
`lib/api-zod/src/index.ts`. That wildcard duplicates the curated type list above it
and collides with `./generated/api` over `SaveWorkspaceStateBody`, failing
`typecheck:libs`. Delete the appended line after each codegen.

**How to apply:** After regenerating API code, run the library typecheck. Keep the runtime schema export available for route validation and explicitly type-export only the safe generated models.