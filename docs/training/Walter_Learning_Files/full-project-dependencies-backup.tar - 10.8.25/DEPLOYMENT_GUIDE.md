# Deployment Guide

## Overview

This guide covers deployment procedures for development, staging, and production environments.

---

## Environment Overview

### Development
- **Purpose**: Local development and feature testing
- **Database**: Local PostgreSQL or Neon development instance
- **API Keys**: Optional, can use mock data
- **Position Sizes**: Paper trading mode recommended
- **Access**: Single developer

### Staging
- **Purpose**: Pre-production validation with live API
- **Database**: Separate Neon staging instance
- **API Keys**: Kraken test API keys with minimal funding ($100-500)
- **Position Sizes**: Small real trades ($10-50 per trade)
- **Access**: Development team for testing

### Production
- **Purpose**: Live trading with full capital allocation
- **Database**: Production Neon instance with backups
- **API Keys**: Kraken production API keys with full funding
- **Position Sizes**: Configured per user strategy
- **Access**: End users with authentication

---

## Staging Environment Setup

### Prerequisites

1. **Kraken Test Account**
   - Create separate Kraken account for testing
   - Fund with minimal amount ($100-500)
   - Generate API keys with trading permissions
   - **Important**: Kraken does not provide sandbox - staging uses real orders with small amounts

2. **Separate Database Instance**
   ```bash
   # Create new Neon database for staging
   # Set environment variable
   export STAGING_DATABASE_URL="postgresql://..."
   ```

3. **Environment Configuration**
   - Copy `.env.example` to `.env.staging`
   - Configure staging-specific variables

### Configuration Files

**`.env.staging`**
```bash
# Environment
NODE_ENV=staging

# Database (separate staging instance)
DATABASE_URL=postgresql://user:password@host/staging_db

# Kraken API (test account with minimal funding)
KRAKEN_API_KEY=your_staging_api_key
KRAKEN_API_SECRET=your_staging_api_secret

# OpenAI (same key, monitor costs)
OPENAI_API_KEY=your_openai_key

# Session
SESSION_SECRET=staging_session_secret

# Logging
LOG_LEVEL=debug
ENABLE_DETAILED_LOGGING=true
```

### Starting Staging Environment

```bash
# Load staging environment
export $(cat .env.staging | xargs)

# Run database migrations
npm run db:push

# Seed with test data (optional)
NODE_ENV=staging tsx server/seed-staging.ts

# Start application
npm run dev
```

### Staging Configuration Profile

Staging uses reduced limits for safety (see `config/staging.json`):

- **Max Position Size**: $50 (vs production varies)
- **Max Open Trades**: 2 (vs production 5-10)
- **Risk Per Trade**: $5 (vs production configurable)
- **Circuit Breaker**: 3 failures (vs production 5)
- **Kill Switch**: 5% loss (vs production 7%)
- **Logging**: Debug level with full API call tracking

### Staging Validation Checklist

Before deploying to production, complete all tests in `STAGING_TEST_PLAN.md`:

- [ ] Bracket Rollback Test (intentional order failure)
- [ ] Partial Fill Recovery Test (order size > order book)
- [ ] Rate Limit Stress Test (50 API calls in 1 second)
- [ ] Circuit Breaker Test (force 5 API failures)
- [ ] Kill Switch Test (trigger loss threshold)
- [ ] Full Integration Test (end-to-end trade lifecycle)
- [ ] Resilience Stack Verification (all safeguards active)
- [ ] Log Rotation Test (verify failover logging)
- [ ] Database Rollback Test (checkpoint restore)
- [ ] AI Analysis Test (ChatGPT incident report)

### Monitoring Staging

```bash
# Tail logs
tail -f logs/staging/trading-$(date +%Y-%m-%d).log

# Monitor database
psql $STAGING_DATABASE_URL -c "SELECT * FROM trades ORDER BY created_at DESC LIMIT 10;"

# Check circuit breaker status
curl http://localhost:5000/api/system/status

# Review API call metrics
curl http://localhost:5000/api/metrics/api-calls
```

---

## Production Deployment

### Prerequisites

- [ ] All staging tests passed (see `STAGING_TEST_PLAN.md`)
- [ ] Architect approval on resilience implementation
- [ ] Production database backups configured
- [ ] Monitoring and alerting setup
- [ ] Rollback procedure documented
- [ ] Kill switch tested and verified

### Pre-Deployment Checklist

1. **Code Review**
   - All resilience features reviewed
   - No testing/debug code in production
   - Environment variables validated
   - API keys secured in secrets

2. **Database**
   - Migrations tested in staging
   - Backup schedule configured
   - Rollback procedure tested
   - Connection pooling configured

3. **Monitoring**
   - Error tracking enabled (logging to files + database)
   - Performance metrics collection
   - Alert thresholds configured
   - Uptime monitoring active

4. **Security**
   - API keys in environment secrets (not code)
   - Session secrets rotated
   - HTTPS enabled for all endpoints
   - Rate limiting active

### Deployment Steps

1. **Build Application**
   ```bash
   # Frontend
   npm run build:client
   
   # Backend
   npm run build:server
   ```

2. **Run Migrations**
   ```bash
   DATABASE_URL=$PRODUCTION_DATABASE_URL npm run db:push
   ```

3. **Deploy to Replit**
   - Push code to repository
   - Verify environment variables in Replit Secrets
   - Click "Publish" in Replit interface
   - Monitor deployment logs

4. **Post-Deployment Verification**
   ```bash
   # Health check
   curl https://your-app.replit.app/api/health
   
   # Verify database connection
   curl https://your-app.replit.app/api/system/status
   
   # Check circuit breaker status
   curl https://your-app.replit.app/api/resilience/status
   ```

### Production Configuration

**Production Safety Limits** (configured in Trading Settings UI):

- **Risk Per Trade**: User configurable (recommended 1-2% of capital)
- **Max Exposure**: 10% of portfolio
- **Max Open Trades**: 5-10 based on strategy
- **Kill Switch**: 7% daily loss threshold
- **Circuit Breaker**: 5 consecutive failures
- **Rate Limiting**: 2 requests/second to Kraken

### Rollback Procedure

If issues occur in production:

1. **Immediate Response**
   ```bash
   # Stop trading engine
   curl -X POST https://your-app.replit.app/api/trading/stop
   
   # Close all open positions (if needed)
   curl -X POST https://your-app.replit.app/api/trading/close-all
   ```

2. **Revert to Previous Version**
   - Use Replit's "View Checkpoints" feature
   - Select last known good checkpoint
   - Restore code, database, and chat session
   - Verify restoration successful

3. **Post-Rollback**
   - Review error logs (`logs/trading-*.log`)
   - Generate AI incident report
   - Document root cause
   - Create fix in staging before redeploying

### Production Monitoring

**Key Metrics to Monitor:**

1. **Trading Performance**
   - Win rate, average R-multiple
   - Daily P&L and drawdown
   - Kill switch triggers

2. **System Health**
   - API call success rate
   - Circuit breaker state
   - Rate limit queue depth
   - Response times

3. **Resilience Features**
   - Bracket rollback events
   - Partial fill recovery actions
   - Retry attempts and successes
   - Exchange constraint rejections

4. **Error Tracking**
   - Failed orders (with reasons)
   - API errors and retries
   - Database connection issues
   - Unexpected exceptions

**Log Locations:**
- Application logs: `logs/trading-YYYY-MM-DD.log`
- Database: `error_logs` table
- AI interactions: `ai_chat_logs` table
- Kill switch events: `kill_switch_events` table

---

## Troubleshooting

### Common Issues

**1. Database Connection Errors**
```bash
# Verify DATABASE_URL is set
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check connection pool
curl http://localhost:5000/api/system/db-status
```

**2. Kraken API Errors**
```bash
# Verify API keys
echo $KRAKEN_API_KEY | head -c 10

# Test API connection
curl http://localhost:5000/api/kraken/test-connection

# Check rate limiting
curl http://localhost:5000/api/resilience/rate-limit-status
```

**3. Circuit Breaker Stuck Open**
```bash
# Check circuit breaker status
curl http://localhost:5000/api/resilience/circuit-breaker-status

# Manual reset (if appropriate)
curl -X POST http://localhost:5000/api/resilience/circuit-breaker-reset
```

**4. Kill Switch Triggered**
```bash
# Check kill switch events
curl http://localhost:5000/api/trading/kill-switch-status

# Generate AI incident report
curl -X POST http://localhost:5000/api/ai/analyze-kill-switch

# Manual recovery (after review)
curl -X POST http://localhost:5000/api/trading/kill-switch-recover
```

### Getting Help

1. Review `EXECUTION_RESILIENCE_REPORT.md` for known limitations
2. Check `STAGING_TEST_PLAN.md` for validation procedures
3. Review error logs in `logs/trading-*.log`
4. Use AI analysis endpoint for error diagnosis
5. Consult `TESTING.md` for mock-based debugging

---

## Maintenance

### Regular Tasks

**Daily**
- Review trade logs and performance metrics
- Check for circuit breaker activations
- Monitor API rate limit queue

**Weekly**
- Review error log trends
- Analyze partial fill events
- Verify backup integrity
- Update AI context with learnings

**Monthly**
- Rotate API keys
- Archive old logs
- Review and update risk parameters
- Performance optimization review

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update packages (test in staging first!)
npm update

# Run tests
npm test

# Deploy to staging for validation
```

---

## Security Best Practices

1. **API Keys**
   - Never commit to repository
   - Use Replit Secrets for storage
   - Rotate every 90 days
   - Limit permissions to minimum required

2. **Database**
   - Use connection pooling
   - Enable SSL/TLS for connections
   - Regular backups (automated)
   - Restrict access by IP when possible

3. **Application**
   - Keep dependencies updated
   - Enable HTTPS only
   - Implement rate limiting on endpoints
   - Log all security-relevant events

4. **Monitoring**
   - Alert on unusual trading activity
   - Monitor for API key compromise indicators
   - Track authentication failures
   - Review logs for suspicious patterns

---

**Version**: 2.1.0  
**Last Updated**: October 4, 2025  
**Maintainer**: Development Team
