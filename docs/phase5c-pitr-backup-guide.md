# Phase 5C - Point-in-Time Recovery & Backup Guide

**Version:** 1.0.0  
**Date:** November 7, 2025  
**Phase:** 5C - Observability Setup

---

## Overview

DawnTrader uses Neon PostgreSQL for database management, which provides automatic point-in-time recovery (PITR) and backup capabilities built into the platform.

## Automatic PITR with Neon

### How It Works

Neon automatically:
- Creates continuous backups every 24 hours
- Maintains 7-day retention for free tier (up to 30 days for Pro/Scale)
- Enables restoration to any point in time within retention window
- Stores backups in geographically distributed locations

### Retention Policies

| Plan | Retention Period | Recovery Points |
|------|------------------|-----------------|
| Free | 7 days | Any point within 7 days |
| Pro | 30 days | Any point within 30 days |
| Scale | Custom (up to 90 days) | Any point within custom period |

## Recovery Procedures

### 1. Restore from Neon Console

**Steps:**
1. Log into Neon Console: https://console.neon.tech
2. Navigate to your project
3. Go to "Branches" tab
4. Click "Create Branch"
5. Select "Point in Time" recovery option
6. Choose the timestamp to restore from
7. Create the branch
8. Update DATABASE_URL to point to the new branch

### 2. Manual Backup Using pg_dump

```bash
# Create a full database backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
psql $DATABASE_URL < backup_20251107_120000.sql
```

### 3. Using Neon Branching (Recommended)

Neon branches are perfect for:
- Testing migrations before production
- Creating isolated environments
- Point-in-time snapshots

```bash
# Create a branch from current state
neon branches create --name production-snapshot

# Create a branch from specific point in time
neon branches create --name pre-migration --timestamp "2025-11-07T10:00:00Z"
```

## Verification Scripts

### Run Backup Verification

```bash
npm run backup:verify
```

This script verifies:
- Database connectivity
- PITR availability
- Database size and health
- Table count and integrity

### Schedule Regular Verification

Add to cron or CI/CD:

```yaml
# .github/workflows/backup-verify.yml
name: Database Backup Verification
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run backup:verify
```

## Disaster Recovery Plan

### Scenario 1: Data Corruption (< 7 days ago)

1. Identify the timestamp before corruption
2. Create a new Neon branch from that point
3. Verify data integrity in the new branch
4. Update DATABASE_URL to point to the new branch
5. Monitor application for 24 hours
6. Delete corrupted branch after verification

### Scenario 2: Accidental Deletion

1. Immediately stop all write operations
2. Create a PITR branch from before deletion
3. Export the deleted data: `pg_dump --data-only --table=<table>`
4. Import into production branch
5. Resume operations

### Scenario 3: Complete Database Loss

1. Contact Neon support immediately
2. Restore from most recent automatic backup
3. Use transaction logs to replay changes if available
4. Verify data integrity with checksums
5. Run full system health check

## Backup Best Practices

### Automated Backups

- ✅ Neon handles this automatically
- ✅ No configuration needed for basic PITR
- ✅ Backups are encrypted at rest

### Manual Backups (Optional)

For critical milestones:

```bash
# Before major migration
npm run db:backup -- --tag "pre-phase-6-migration"

# Before production deployment
npm run db:backup -- --tag "pre-v2.0-release"
```

### Testing Recovery

Monthly recovery drills:

```bash
# 1. Create test branch from 48h ago
neon branches create --name recovery-test --timestamp "48 hours ago"

# 2. Connect to test branch and verify data
DATABASE_URL=<test_branch_url> npm run db:verify

# 3. Delete test branch
neon branches delete recovery-test
```

## Monitoring & Alerts

### Backup Health Metrics

Phase 5C metrics service tracks:
- Last successful backup timestamp
- Backup size trends
- Recovery point age
- PITR availability status

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Backup Age | > 25 hours | > 30 hours |
| PITR Gap | > 8 days | > 10 days |
| Database Size Growth | > 50%/week | > 100%/week |

## Integration with Phase 5C Observability

The backup system integrates with:

1. **Metrics Service** - Tracks backup health
2. **Structured Logging** - Records all backup operations
3. **Alert Engine** - Notifies on backup failures

### Example Metrics Query

```typescript
// Get backup health from metrics API
const response = await fetch('/api/metrics');
const { system } = await response.json();

console.log('Database uptime:', system.uptime);
console.log('Last backup:', system.lastBackup);
```

## Security Considerations

### Encryption
- ✅ All Neon backups encrypted at rest (AES-256)
- ✅ Transit encryption via TLS 1.3
- ✅ Access controlled via Neon API keys

### Access Control
- Only database admin can initiate PITR
- Backup restoration requires project owner permissions
- Audit logs maintained for all recovery operations

## Cost Optimization

### Free Tier Limits
- 7-day retention: $0
- Automatic backups: $0
- Standard PITR: $0

### Pro Tier Benefits
- Extended retention (30 days): ~$20/month
- Faster recovery: Included
- More frequent snapshots: Included

### Best Practices
- Use branching for testing instead of duplicate databases
- Clean up old branches regularly
- Monitor storage usage via Neon dashboard

---

## Quick Reference

| Task | Command |
|------|---------|
| Verify backup | `npm run backup:verify` |
| Create manual backup | `pg_dump $DATABASE_URL > backup.sql` |
| Create PITR branch | `neon branches create --name <name> --timestamp <time>` |
| Test recovery | `DATABASE_URL=<branch_url> npm run db:verify` |

---

**Maintained by:** DawnTrader DevOps  
**Last Updated:** November 7, 2025  
**Next Review:** December 7, 2025
