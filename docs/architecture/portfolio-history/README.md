# Portfolio History Architecture

This directory contains comprehensive documentation for the portfolio history system, which handles daily portfolio snapshots, historical chart data, and automated backfill mechanisms.

## 📚 Documentation Index

### [PORTFOLIO_CHART_FINAL_FIX.md](./PORTFOLIO_CHART_FINAL_FIX.md)
**Quick reference guide for the recent portfolio chart fix**

- Problem diagnosis and root cause analysis
- Step-by-step fix implementation
- Testing and verification procedures
- Deployment instructions (cron/Lambda)
- Expected chart behavior

**Use this when**: You need to understand what was broken and how it was fixed.

---

### [PORTFOLIO_HISTORY_PRODUCTION_SOLUTION.md](./PORTFOLIO_HISTORY_PRODUCTION_SOLUTION.md)
**Complete technical documentation for the production-grade portfolio history system**

- Full architecture overview
- Component breakdown and data flow
- Database schema and snapshot types
- Industry best practices comparison
- Performance metrics and cost analysis
- Long-term scaling considerations

**Use this when**: You need deep technical understanding or are planning system enhancements.

---

## 🏗️ System Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                   PORTFOLIO HISTORY SYSTEM                    │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. DAILY CAPTURE (Automated)                                │
│     ├─ Cron / AWS EventBridge                                │
│     ├─ Runs at 4:30 PM ET daily                              │
│     └─ Service: daily_snaptrade_snapshot.py                  │
│                                                               │
│  2. DATA SOURCES                                             │
│     ├─ SnapTrade Reporting API (historical)                  │
│     ├─ Live Portfolio Value (current)                        │
│     └─ FMP API (EOD prices for enrichment)                   │
│                                                               │
│  3. INTELLIGENT BACKFILL                                     │
│     ├─ Gap detection (last 30 days)                          │
│     ├─ Automatic historical fetch                            │
│     └─ Idempotent operations                                 │
│                                                               │
│  4. DATABASE (Supabase)                                      │
│     ├─ Table: user_portfolio_history                         │
│     ├─ Snapshot types: daily_eod, reconstructed, estimated   │
│     └─ Indexed on (user_id, value_date)                      │
│                                                               │
│  5. API ENDPOINTS                                            │
│     ├─ GET /api/portfolio/history                            │
│     ├─ POST /api/snaptrade/capture-daily-snapshot            │
│     └─ POST /api/snaptrade/fetch-reporting-history           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## 🔑 Key Components

### Backend Services

| Service | Location | Purpose |
|---------|----------|---------|
| Daily Snapshot Service | `backend/services/daily_snaptrade_snapshot.py` | Automated EOD capture + backfill |
| SnapTrade Reporting | `backend/services/snaptrade_reporting_service.py` | Fetch historical data from SnapTrade |
| Aggregated Portfolio | `backend/utils/portfolio/aggregated_portfolio_service.py` | Serve historical data to frontend |

### Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `user_portfolio_history` | Historical snapshots | `value_date`, `total_value`, `snapshot_type` |
| `user_aggregated_holdings` | Current positions | `symbol`, `total_market_value`, `updated_at` |
| `snaptrade_brokerage_connections` | Active connections | `user_id`, `connection_status` |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/portfolio/history` | GET | Get chart data for period (1W, 1M, etc.) |
| `/api/snaptrade/capture-daily-snapshot` | POST | Manually trigger snapshot capture |
| `/api/snaptrade/fetch-reporting-history` | POST | Backfill historical data |

## 🚀 Quick Start

### Verify Current State

```bash
cd /Users/cristian_mendoza/Desktop/clera/backend
source venv/bin/activate

# Check recent snapshots
python3 << 'EOF'
import os
from supabase import create_client

with open('.env') as f:
    for line in f:
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            os.environ[k] = v

supabase = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))
user_id = 'YOUR_USER_ID'

snapshots = supabase.table('user_portfolio_history')\
    .select('value_date, total_value, snapshot_type')\
    .eq('user_id', user_id)\
    .order('value_date', desc=True)\
    .limit(7)\
    .execute()

print("Last 7 snapshots:")
for snap in snapshots.data:
    print(f"  {snap['value_date']} | ${float(snap['total_value']):>10,.2f} | {snap['snapshot_type']}")
EOF
```

### Manual Snapshot Capture

```bash
cd /Users/cristian_mendoza/Desktop/clera/backend
source venv/bin/activate

python3 -c "import asyncio; from services.daily_snaptrade_snapshot import get_daily_snapshot_service; asyncio.run(get_daily_snapshot_service().capture_all_users_snapshots())"
```

### Deploy Automated Capture

**Cron Job**:
```bash
crontab -e
# Add: 30 16 * * * cd /path/to/clera/backend && source venv/bin/activate && python3 -c "import asyncio; from services.daily_snaptrade_snapshot import get_daily_snapshot_service; asyncio.run(get_daily_snapshot_service().capture_all_users_snapshots())"
```

**AWS Lambda**: See [PORTFOLIO_HISTORY_PRODUCTION_SOLUTION.md](./PORTFOLIO_HISTORY_PRODUCTION_SOLUTION.md#deployment-instructions)

## 📊 Snapshot Types Explained

### `daily_eod` (End of Day)
- **Source**: Captured at 4:30 PM ET via automated job
- **Reliability**: Highest (official EOD value)
- **Persistence**: Never auto-deleted
- **Use Case**: Primary source for historical charts

### `reconstructed`
- **Source**: Fetched from SnapTrade reporting API
- **Reliability**: High (broker-provided data)
- **Persistence**: Can be refreshed/replaced
- **Use Case**: Backfilling gaps, historical reconstruction

### `estimated`
- **Source**: Generated from current holdings + historical prices
- **Reliability**: Lower (assumes constant position sizes)
- **Persistence**: Temporary, replaced by real data
- **Use Case**: Fallback for pre-connection dates

## 🔍 Troubleshooting

### Chart shows zeros
**Cause**: Missing snapshots  
**Fix**: Run manual backfill or check automated capture logs

### Chart has spikes/oscillations
**Cause**: Inconsistent data sources or cash not included  
**Fix**: Verify snapshot types, check cash inclusion in calculations

### Gap in historical data
**Cause**: Server downtime, SnapTrade connection issues  
**Fix**: Automated backfill will handle this on next run

### Today's return incorrect
**Cause**: Missing yesterday's snapshot  
**Fix**: Ensure daily capture is running at EOD

## 📈 Performance Metrics

- **Query Speed**: < 10ms (indexed queries)
- **Storage**: ~36 KB/user/year
- **API Costs**: ~$0.0001/user/day
- **Compute**: ~0.1s per user for daily capture

## 🎯 Related Documentation

- [Backend Services README](../../backend/services/README.md)
- [API Documentation](../../backend/docs/API.md)
- [Database Schema](../../backend/docs/DATABASE_SCHEMA.md)

## 📝 Change Log

### October 28, 2025
- ✅ Fixed portfolio chart data gaps
- ✅ Implemented automated backfill service
- ✅ Created production-grade documentation
- ✅ Deployed manual snapshots for Oct 19-28

---

**For questions or issues, refer to the detailed documentation files in this directory.**

