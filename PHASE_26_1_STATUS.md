# Phase 26.1 Auto-Tuning Engine - Implementation Status

## Completed Work

### 1. Database Schema ✅
- Added three new tables with proper enums:
  - `tuning_policy`: Stores per-user, per-mode tuning configuration
  - `tuning_event`: Audit trail of all tuning adjustments
  - `parameter_baseline`: Parameter snapshots for rollback (not yet wired)
- Enums: `tuning_approval_type`, `tuning_status`, `tuning_aggressiveness`
- Proper indexes for performance
- All schema changes ready for `npm run db:push --force`

### 2. Storage Layer ✅
- Added 5 methods to `IStorage` interface:
  - `getTuningPolicy()`: Fetch policy for user/mode
  - `upsertTuningPolicy()`: Create or update policy
  - `getTuningEvents()`: Query tuning events with filters
  - `createTuningEvent()`: Log new tuning adjustment
  - `updateTuningEvent()`: Mark event as reverted
- Implemented all methods in `DatabaseStorage` class
- Methods use proper Drizzle ORM patterns

### 3. Frontend Component ✅
- Created `TuningTab` component with:
  - Mode selector (paper/live)
  - Enable/disable toggle
  - Auto-refresh (30s active, 120s idle based on tab visibility)
  - Real-time events table with rollback buttons
  - Summary statistics cards
  - Policy configuration display
  - CSV export functionality
- Integrated into Goals Engine page as 6th tab
- Proper data-testid attributes for testing

### 4. Documentation ✅
- Updated `replit.md` with Phase 26.1 description

## Critical Issues Identified by Architect 🚨

### 1. Validation Bypass (CRITICAL)
**Problem**: API routes in `server/routes.ts` directly access database without Zod validation.

**Impact**: 
- Malformed payloads (missing `mode`, invalid `aggressiveness`) can corrupt tuning policies
- Number(limit) can become NaN causing 500 errors
- No type safety at API boundary

**Fix Required**:
```typescript
// Need to add validation schemas
const enableTuningSchema = z.object({
  mode: z.enum(['live', 'paper']),
  aggressiveness: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
  fieldBounds: z.record(z.any()).optional()
});

// Then validate in route:
const validated = enableTuningSchema.parse(req.body);
```

### 2. Storage Layer Bypass (CRITICAL)
**Problem**: Routes call Drizzle directly instead of using storage methods.

**Current (Wrong)**:
```typescript
const events = await db
  .select()
  .from(tuningEvent)
  .where(and(...conditions))
  .orderBy(desc(tuningEvent.createdAt))
  .limit(Number(limit));
```

**Should Be**:
```typescript
const events = await storage.getTuningEvents({
  userId,
  mode: mode as string,
  limit: Number(limit)
});
```

### 3. Baseline Not Wired (MEDIUM)
**Problem**: `parameter_baseline` table exists but is never used for snapshots/rollback.

**Impact**: Rollback only reverses the specific event, doesn't restore full parameter state.

**Fix Required**: 
- Capture baseline snapshot when enabling tuning
- Use baseline for rollback instead of simple old/new swap

## Next Steps to Complete Phase 26.1

### Step 1: Add Zod Validation Schemas
Create request validation schemas in `shared/schema.ts` or `server/routes.ts`:

```typescript
const getTuningEventsSchema = z.object({
  mode: z.string().optional(),
  limit: z.coerce.number().optional()
});

const enableTuningSchema = z.object({
  mode: z.enum(['live', 'paper']),
  aggressiveness: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
  fieldBounds: z.record(z.any()).optional()
});

const disableTuningSchema = z.object({
  mode: z.enum(['live', 'paper'])
});

const rollbackEventSchema = z.object({
  eventId: z.string()
});
```

### Step 2: Refactor Routes to Use Storage

Update all 5 tuning routes to:
1. Validate request body with Zod
2. Call storage methods instead of direct DB access
3. Handle errors consistently

Example refactor for `/api/tuning/events`:
```typescript
app.get('/api/tuning/events', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const validated = getTuningEventsSchema.parse(req.query);
    
    const events = await storage.getTuningEvents({
      userId,
      mode: validated.mode,
      limit: validated.limit || 50
    });
    
    res.json(events);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
    }
    console.error('[TuningAPI] Error fetching events:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### Step 3: Implement Baseline Functionality

Add baseline snapshot methods to storage:
```typescript
// In IStorage interface:
createParameterBaseline(data: any): Promise<any>;
getLatestBaseline(params: { userId: string; mode: string }): Promise<any | null>;

// Use when enabling tuning:
const currentParams = { /* snapshot current parameter state */ };
await storage.createParameterBaseline({
  userId,
  mode,
  snapshotData: currentParams
});

// Use in rollback to restore full state instead of just swapping values
```

### Step 4: Push Schema to Database
```bash
npm run db:push --force
```

### Step 5: End-to-End Testing
Test scenarios:
1. Enable tuning with valid/invalid payloads
2. Disable tuning
3. Query events with filters
4. Rollback an event
5. CSV export
6. Auto-refresh behavior

## Files Modified

- `shared/schema.ts`: Added 3 tables, 3 enums, insert schemas, types
- `server/storage.ts`: Added 5 tuning methods to interface and implementation
- `server/routes.ts`: Added 5 tuning API endpoints (need validation/storage refactor)
- `client/src/components/goals/tuning-tab.tsx`: New component
- `client/src/pages/goals-engine.tsx`: Integrated Tuning tab
- `replit.md`: Added Phase 26.1 documentation

## Estimated Time to Complete

- Validation schemas: 15 minutes
- Route refactoring: 30 minutes
- Baseline implementation: 45 minutes
- Testing and fixes: 30 minutes
- **Total**: ~2 hours

## Current State

- Frontend is complete and functional
- Backend compiles and runs but bypasses validation/storage
- Database schema is defined but not pushed
- Architecture review identified critical security/correctness issues

**Recommendation**: Complete the validation/storage refactoring before deploying to users, as current implementation allows malformed data and lacks proper error handling.
