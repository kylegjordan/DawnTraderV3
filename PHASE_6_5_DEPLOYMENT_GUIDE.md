# Phase 6.5 - Deployment & 48-Hour Paper Trading Simulation

## 🎯 Overview
Deploy Walter system for a continuous 48-hour paper trading simulation with $800 starting balance.

## ✅ Prerequisites
- Phase 6.4 completed and verified ✅
- No active background processes
- Database connected
- API keys configured (OpenAI, Kraken)

## 📦 Step 1 - Prepare Deployment

### Build Production Bundle
```bash
npm run build
```

### Verify Build
```bash
npm start
```
This should start the production server without errors.

## 🔧 Step 2 - Environment Variables

The following environment variables are pre-configured:
- `NODE_ENV=production`
- `PAPER_TRADING_ENABLED=true`
- `STARTING_BALANCE_USD=800`
- `TRADING_MODE=paper`
- `TRADE_LOG_DIR=/logs/trading_sessions`

## 🚀 Step 3 - Launch 48-Hour Simulation

### Start Paper Trading
```bash
tsx server/paper-trading-start.ts
```

**OR** run in background:
```bash
nohup tsx server/paper-trading-start.ts > /logs/trading_sessions/simulation.log 2>&1 &
```

### What Happens Next:
1. ✅ Loads $800 as initial virtual balance
2. ✅ Begins simulated trading against live market feeds (Kraken)
3. ✅ Logs every trade, order, and balance update to `/logs/trading_sessions/session_<timestamp>.json`
4. ✅ Generates rolling summaries every 6 hours in `/logs/trading_summaries/`
5. ✅ Console updates every 10 minutes showing:
   ```
   [Walter Paper Trade] ⏱️ 2.3h | 💰 Balance: $834.50 | 📊 Open Positions: 2 | 📈 PnL: +4.31% | 🎯 Trades: 5
   ```

## 📊 Step 4 - Monitoring

### Real-time Console Output
The simulation displays:
- **Elapsed Time**: Hours since start
- **Current Balance**: Virtual USD balance
- **Open Positions**: Number of active trades
- **PnL**: Profit/Loss percentage
- **Total Trades**: Cumulative trade count

### Log Files Location
- **Session Logs**: `/logs/trading_sessions/session_<timestamp>.json`
- **6-Hour Summaries**: `/logs/trading_summaries/summary_<timestamp>.json`
- **Main Log**: `/logs/trading_sessions/simulation.log` (if run in background)

### Check Session Status
```bash
# View latest session log
ls -lt /home/runner/workspace/logs/trading_sessions/ | head -5

# View last 50 lines of console output
tail -50 /logs/trading_sessions/simulation.log
```

## ⏸️ Step 5 - Manual Stop (if needed)

### Stop Simulation Early
```bash
# Find process ID
ps aux | grep paper-trading-start

# Kill process (gracefully)
kill <PROCESS_ID>
```

This generates a partial summary at:
```
/logs/paper_trading_interrupted.json
```

## 📈 Step 6 - Final Report (After 48 Hours)

### Automatic Report Generation
After 48 hours, the system automatically generates:

1. **Performance Summary**: `/logs/paper_trading_48hr_summary.json`
   ```json
   {
     "sessionId": "session_1760389217563",
     "startTime": "2025-10-13T21:00:00.000Z",
     "endTime": "2025-10-15T21:00:00.000Z",
     "startingBalance": 800,
     "currentBalance": 856.42,
     "totalTrades": 23,
     "winningTrades": 15,
     "losingTrades": 8,
     "totalPnL": 56.42,
     "pnlPercent": 7.05,
     "maxDrawdown": 3.21,
     "status": "completed"
   }
   ```

2. **AI Analysis**: `/logs/ai_analysis/ai_trading_behavior_summary.json`
   - Trading behavior patterns
   - Strategy distribution
   - Decision accuracy metrics
   - Performance recommendations

### View Final Results
```bash
# View 48-hour summary
cat /logs/paper_trading_48hr_summary.json

# View AI analysis
cat /logs/ai_analysis/ai_trading_behavior_summary.json
```

## 🎯 Success Criteria

Phase 6.5 is **successful** when:
- ✅ Walter runs for 48 hours without crashes
- ✅ All logs and reports are generated automatically
- ✅ Ending balance and PnL data are visible
- ✅ AI analysis summary is stored and verifiable
- ✅ No trade execution stalls occurred

## 📊 Expected Outputs

### Console Output Example
```
======================================================================
🚀 STARTING 48-HOUR PAPER TRADING SIMULATION
======================================================================
Session ID: session_1760389217563
Starting Balance: $800
Start Time: 2025-10-13T21:00:00.000Z
Duration: 48 hours
======================================================================

📝 Session log initialized: /logs/trading_sessions/session_1760389217563.json

[Walter Paper Trade] ⏱️ 0.2h | 💰 Balance: $800.00 | 📊 Open Positions: 0 | 📈 PnL: +0.00% | 🎯 Trades: 0
[Walter Paper Trade] ⏱️ 0.3h | 💰 Balance: $807.25 | 📊 Open Positions: 1 | 📈 PnL: +0.91% | 🎯 Trades: 1
...
```

### Final Summary Example
```
======================================================================
📊 FINAL SIMULATION RESULTS
======================================================================
Starting Balance: $800.00
Ending Balance: $856.42
Net Change: +7.05%
Total Trades: 23
Win Rate: 65.2%
Max Drawdown: 3.21%
======================================================================
```

## 🔧 Troubleshooting

### Simulation Not Starting
```bash
# Check if user exists
tsx -e "import {storage} from './server/storage'; storage.getTradingSettings('6c591801-3072-431d-b192-30aaf426f15e').then(console.log)"
```

### No Trades Executing
- Verify Kraken API connection
- Check market scanner is running
- Review strategy settings (ensure at least one strategy is enabled)

### High Memory Usage
- Paper simulation is designed to run efficiently
- Expected memory usage: ~200-500MB
- Logs are rotated automatically

## 📚 Next Steps

After successful 48-hour simulation:
1. Review `/logs/paper_trading_48hr_summary.json`
2. Analyze AI behavioral insights
3. Verify performance meets expectations
4. Proceed to **Phase 6.6** (Live Mode Readiness)

---

## 💡 Optional Enhancements

After deployment, you can:
- Enable Telegram/email notifications for profit/loss thresholds
- Add chart visualization for balance and PnL over time
- Configure automatic pause on drawdown limits
- Adjust strategy parameters based on AI recommendations
