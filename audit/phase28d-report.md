# Phase 28.D: Predictive Insights & Anomaly Detection

**Status**: ✅ COMPLETED  
**Date**: October 29, 2025  
**Objective**: Implement anomaly detection system for override configuration changes with predictive insights and automated nightly analysis.

---

## Overview

Phase 28.D extends the override audit system (Phase 28.C) with intelligent anomaly detection capabilities. The system analyzes audit logs to identify unusual patterns in configuration override changes, including frequency spikes and rapid value reversions. This enables proactive monitoring of potentially problematic configuration behaviors.

---

## Implementation Summary

### 1. Anomaly Detection Service

**File**: `server/services/audit-anomaly-detection.ts`

**Core Capabilities**:
- **Frequency Spike Detection**: Identifies when a user makes >5 override changes within a 1-hour window
- **Value Reversion Detection**: Detects when a configuration value is changed back to its previous value within <10 minutes
- **Hourly Frequency Analysis**: Aggregates override counts by hour for the last 24 hours (paper vs live modes)

**Detection Rules**:
```typescript
// Rule 1: Frequency Spike
// Trigger: >5 changes per hour by same user
// Severity: WARN or CRITICAL (if >10 changes)

// Rule 2: Value Reversion  
// Trigger: Field reverted to previous value within 10 minutes
// Severity: WARN
```

**Key Methods**:
- `detectAnomalies()`: Runs both detection algorithms and returns array of anomaly objects
- `getOverrideFrequencyData()`: Returns hourly override counts for charting (24-hour window)
- `detectFrequencySpikes()`: Analyzes audit logs for unusual change frequency patterns
- `detectValueReversions()`: Identifies rapid configuration flip-flops

---

### 2. Nightly Scheduled Task

**File**: `server/services/audit-anomaly-task.ts`

**Configuration**:
- **Schedule**: Daily at 2:00 AM UTC
- **Frequency**: Every 24 hours (86400000ms interval)
- **Execution**: Automated via SchedulerRegistry

**Registration** (`server/index.ts`):
```typescript
schedulerRegistry.registerTask({
  name: auditAnomalyTask.name,
  description: auditAnomalyTask.description,
  frequency: auditAnomalyTask.frequency,
  intervalMs: auditAnomalyTask.intervalMs,
  run: auditAnomalyTask.run.bind(auditAnomalyTask),
  lastRun: null,
  nextRun: null,
  status: 'idle'
});
```

**Telemetry Output**:
```bash
# Normal execution (no anomalies)
[Audit] OverridesAnomaly OK | anomalies=0

# Anomalies detected
[Audit] OverridesAnomaly WARN | anomalies=3 | critical=1 | warn=2
  • Frequency spike: user123 made 7 changes to guardrails_v2 in 1 hour (critical)
  • Value reversion: portfolioRiskPerTrade changed back within 5 minutes (warn)
  • Frequency spike: user456 made 6 changes to filters_v2 in 1 hour (warn)
```

---

### 3. API Endpoints

**File**: `server/routes.ts`

#### GET `/api/diagnostics/audit-anomalies`
- **Authentication**: JWT required
- **Response**: Array of detected anomalies with metadata
- **Use Case**: Real-time anomaly inspection

**Response Schema**:
```json
{
  "ok": true,
  "data": [
    {
      "timestamp": "2025-10-29T14:32:00.000Z",
      "anomalyType": "frequency_spike",
      "severity": "critical",
      "description": "User 'admin' made 12 changes to guardrails_v2 in 1 hour",
      "metadata": {
        "changedBy": "admin",
        "entityType": "guardrails_v2",
        "changeCount": 12,
        "timeWindow": "1 hour"
      }
    }
  ],
  "count": 1,
  "timestamp": "2025-10-29T15:00:00.000Z"
}
```

#### GET `/api/diagnostics/override-frequency`
- **Authentication**: JWT required
- **Response**: Hourly override frequency data (last 24 hours)
- **Use Case**: Trend visualization

**Response Schema**:
```json
{
  "ok": true,
  "data": [
    {
      "hour": "2025-10-29T14:00:00.000Z",
      "paperCount": 3,
      "liveCount": 1,
      "totalCount": 4
    }
  ],
  "timestamp": "2025-10-29T15:00:00.000Z"
}
```

---

### 4. Frontend Chart Component

**File**: `client/src/components/OverrideFrequencyChart.tsx`

**Features**:
- **Line Chart**: 24-hour override frequency trends using Recharts
- **Mode Breakdown**: Separate lines for Paper, Live, and Total changes
- **Anomaly Alert**: Real-time anomaly summary with severity badges
- **Summary Stats**: Total changes per mode in last 24 hours
- **Auto-refresh**: Queries update every 60 seconds
- **Manual Refresh**: Button to force data reload

**Visual Elements**:
- Blue line: Paper mode changes
- Orange line: Live mode changes  
- Green dashed line: Total changes
- Alert banner: Critical/warning anomalies with descriptions

**Data Attributes**:
```html
<Button data-testid="button-refresh-frequency">Refresh</Button>
```

---

### 5. UI Integration

**File**: `client/src/pages/settings.tsx`

**Location**: Settings > Developer Tab (Admin only)

**Component Order**:
1. **OverrideFrequencyChart** (top) - Trend analysis with anomaly alerts
2. **ConfigSnapshotViewer** (middle) - Current config state
3. **AuditLogViewer** (bottom) - Historical change log

**Access Control**: Requires `currentUser.isAdmin === true`

---

## Database Schema

No new tables required. The system reuses the existing `audit_log` table from Phase 28.C:

**Query Patterns**:
```sql
-- Frequency spike detection
SELECT changed_by, entity_type, COUNT(*) as change_count
FROM audit_log
WHERE changed_at >= NOW() - INTERVAL '1 hour'
GROUP BY changed_by, entity_type
HAVING COUNT(*) > 5;

-- Value reversion detection
WITH reversions AS (
  SELECT 
    field_name,
    old_value,
    new_value,
    changed_at,
    LAG(new_value) OVER (PARTITION BY field_name ORDER BY changed_at) as prev_value
  FROM audit_log
  WHERE changed_at >= NOW() - INTERVAL '10 minutes'
)
SELECT * FROM reversions
WHERE new_value = LAG(old_value);

-- Hourly frequency aggregation
SELECT 
  DATE_TRUNC('hour', changed_at) as hour,
  SUM(CASE WHEN mode = 'paper' THEN 1 ELSE 0 END) as paper_count,
  SUM(CASE WHEN mode = 'live' THEN 1 ELSE 0 END) as live_count,
  COUNT(*) as total_count
FROM audit_log
WHERE changed_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

## Telemetry & Monitoring

### Startup Logs
```bash
[SchedulerRegistry] All autonomous tasks started successfully
# Anomaly task registered with 24-hour interval
```

### Runtime Logs
```bash
# API request logs
[AuditAnomalies:audit-anomalies-1730220000000] Running anomaly detection...
[OverrideFrequency:override-freq-1730220000000] Fetching hourly frequency data...

# Nightly task execution
[AuditAnomaly] Running nightly anomaly detection...
[Audit] OverridesAnomaly OK | anomalies=0
```

### Error Handling
```bash
[AuditAnomalies:audit-anomalies-1730220000000] Error: Database connection timeout
# HTTP 500 response with error detail
```

---

## Testing Scenarios

### Test 1: Frequency Spike Detection
1. Make 6+ override changes within 1 hour
2. Navigate to Settings > Developer tab
3. Verify chart shows spike in corresponding hour
4. Verify anomaly alert displays frequency spike warning

### Test 2: Value Reversion Detection
1. Change `portfolioRiskPerTrade` from 2.0 to 3.0
2. Within 10 minutes, change back to 2.0
3. Navigate to Settings > Developer tab
4. Verify anomaly alert displays value reversion warning

### Test 3: Chart Visualization
1. Navigate to Settings > Developer tab
2. Verify chart displays last 24 hours of data
3. Verify mode breakdown (paper/live/total lines)
4. Verify summary stats match chart data
5. Click Refresh button, verify data updates

### Test 4: Nightly Task Execution
1. Wait for 2:00 AM UTC (or manually trigger via scheduler)
2. Check server logs for `[Audit] OverridesAnomaly` telemetry
3. Verify anomaly count matches detected issues
4. Verify detailed anomaly descriptions in logs

---

## Detection Algorithm Details

### Frequency Spike Algorithm

**Input**: Last 24 hours of audit logs  
**Window**: 1-hour rolling window  
**Threshold**: 5 changes per hour per user  

**Severity Classification**:
- **WARN**: 6-10 changes per hour
- **CRITICAL**: >10 changes per hour

**Pseudocode**:
```
FOR each user in audit_logs:
  FOR each 1-hour window in last 24 hours:
    count = changes by user in window
    IF count > 5:
      severity = count > 10 ? "critical" : "warn"
      EMIT anomaly(type="frequency_spike", severity, metadata)
```

### Value Reversion Algorithm

**Input**: Last 24 hours of audit logs  
**Window**: 10-minute lookback  
**Detection**: `new_value` matches `old_value` from previous change  

**Severity**: Always WARN

**Pseudocode**:
```
FOR each field in audit_logs:
  ORDER changes by timestamp DESC
  FOR each change:
    prev_change = previous change for same field
    IF prev_change AND change.new_value == prev_change.old_value:
      time_diff = change.timestamp - prev_change.timestamp
      IF time_diff < 10 minutes:
        EMIT anomaly(type="value_reversion", severity="warn", metadata)
```

---

## Future Enhancements

1. **Machine Learning Integration**: Train ML model on historical patterns to predict anomalies before they occur
2. **Custom Threshold Configuration**: Allow admins to adjust frequency/reversion thresholds via UI
3. **Email/Slack Notifications**: Alert admins immediately when critical anomalies detected
4. **Anomaly Resolution Workflow**: Add UI for marking anomalies as "reviewed" or "false positive"
5. **Cross-Mode Correlation**: Detect when paper and live modes show divergent override patterns
6. **User Behavior Profiling**: Build baseline profiles per user to detect deviations from normal behavior

---

## Verification Checklist

- [x] AuditAnomalyDetectionService implements frequency spike detection
- [x] AuditAnomalyDetectionService implements value reversion detection
- [x] AuditAnomalyDetectionService provides hourly frequency aggregation
- [x] Nightly task registered in SchedulerRegistry
- [x] API endpoint `/api/diagnostics/audit-anomalies` returns detection results
- [x] API endpoint `/api/diagnostics/override-frequency` returns chart data
- [x] OverrideFrequencyChart component displays 24-hour trends
- [x] Chart shows paper/live/total mode breakdown
- [x] Anomaly alerts display in chart component
- [x] Component integrated into Developer tab
- [x] Telemetry logs anomaly detection results
- [x] Error handling for API failures
- [x] Auto-refresh and manual refresh functionality
- [x] Summary stats display total changes per mode

---

## Conclusion

Phase 28.D successfully implements predictive anomaly detection for override configuration changes. The system provides:

1. **Automated Detection**: Nightly analysis of audit logs for unusual patterns
2. **Real-Time Insights**: On-demand API endpoints for immediate anomaly inspection
3. **Visual Analytics**: Interactive chart showing override frequency trends
4. **Proactive Monitoring**: Alert system for critical configuration issues

The implementation follows the database-first architecture from Phase 28.C and integrates seamlessly with existing audit infrastructure. Admins now have visibility into configuration change patterns and can identify potentially problematic behaviors before they impact trading operations.

**Next Phase**: Phase 28.E - Automated Rollback Recommendations based on detected anomalies.
