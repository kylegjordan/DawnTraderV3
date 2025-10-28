# Phase 1: LATTi Goals + Guardrails Modernization Audit

## Overview
This directory contains the comprehensive Phase 1 audit of guardrails, filters, strategy settings, and trading parameters across the entire system architecture.

## Audit Objective
Inventory and classify every guardrail and filter reference across database, API, and client to understand overlaps, dependencies, and conflicts before simplification.

## Methodology
1. **Repository Mapping**: Database → API → Client
2. **Comprehensive Inventories**: Guardrails, Filters, Parameters
3. **Conflict Analysis**: Identify duplicates, contradictions, overlaps
4. **Source-of-Truth Assignment**: Define single authoritative sources

## Audit Scope
- **Database**: Mode-scoped global settings (Paper/Live)
- **API**: All `/api` routes for guardrails/filters/settings
- **Client**: Goals Engine, LATTI widgets, Filter tabs

## Key Architectural Principles
1. **Mode-Based Global Settings**: One engine per mode (Paper/Live), shared by all users
2. **NO User-Scoped Settings**: All guardrails/filters are global per mode
3. **LATTI as Local Optimizer**: Autonomous parameter tuning within guardrail bounds
4. **Database-Driven Everything**: Zero hardcoded values in code

## Deliverables

### 1. `db_map.json`
Complete database schema mapping for all relevant tables with columns, types, constraints, and mode scoping.

### 2. `endpoints_map.json`
Comprehensive mapping of all API endpoints that read/write guardrails, filters, strategy settings, and engine state.

### 3. `guardrails_inventory.csv`
Complete inventory of all guardrail parameters with scope, defaults, API endpoints, database columns, and usage.

### 4. `filters_inventory.csv`
Complete inventory of all filter parameters with categories, types, scope, and usage by scanner/strategy.

### 5. `conflicts_matrix.csv`
Analysis of parameter duplications, contradictions, and overlaps with recommended resolutions.

### 6. `Phase1_recommendations.md`
Written recommendations including:
- Core Four Guardrails to keep visible
- Fields to deprecate in Phase 2
- Coherency rules (draft)
- Source-of-Truth assignments

## Testing Credentials
- **Username**: testuser123
- **Password**: SecurePass123!

## Status
**Phase**: 1 of 4 (Audit & Mapping)  
**Status**: Complete  
**Date**: October 28, 2025

## Next Steps (Phase 2+)
1. Generate `schema_guardrails_v2.sql` (core-four only, percent-based)
2. Create `coherency_rules.yaml` enforcement
3. Implement "Lottie Controls with Manual Override" UI pattern
4. Deprecate redundant fields (mark for analytics transition)
