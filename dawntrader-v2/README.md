# DawnTrader v2

This is the isolated development folder for DawnTrader v2.

## Structure

- `backend/` - Backend services, routes, database, and utilities
- `frontend/` - Frontend components, pages, services, and utilities  
- `shared/` - Shared types and schemas
- `scripts/` - Test and migration scripts
- `e2e/` - End-to-end tests with Playwright
- `docs/` - Blueprints, API documentation, and validation reports

## Isolation

This folder is completely independent from the DawnTrader v1 codebase (`/server`, `/client`). No imports or symbolic links connect the two versions.
