# CLAUDE.md

This repository contains the Heita CRM bootstrap: a mobile-first Next.js 15 CRM/PWA for South African retailers and small businesses.

## Stack
- Next.js 15 App Router with TypeScript and Turbopack
- Tailwind CSS v4 and shadcn/ui
- PostgreSQL 16 + Prisma + pgvector
- Auth.js v5, tRPC v11, TanStack Query v5
- BullMQ + Redis, MinIO/R2, Ollama + Anthropic fallback

## Core Commands
- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm run docker:up`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run worker:dev`

## Architecture Notes
- `src/app`: App Router pages, route groups, API endpoints, dashboard surfaces
- `src/lib`: infrastructure clients and AI integrations
- `src/server`: tRPC setup, routers, business services
- `src/workers`: BullMQ workers for document ingestion and WhatsApp AI replies
- `prisma/schema.prisma`: shared multi-tenant data model with `businessId` on business-scoped entities

## Current Status
- Phase 0 scaffold is in place.
- Node.js/npm were not available in the shell during bootstrap, so dependencies were not installed and the project has not yet been built or migrated.
