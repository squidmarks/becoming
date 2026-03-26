# MongoDB Migration Guide

This guide explains how the inverter monitor's smart storage system works and how to transition to cloud storage.

## Overview

The inverter monitor uses a **hybrid storage approach**:

- **Local CSV** (default): Reliable, works offline, 7-day retention
- **Cloud MongoDB** (optional): Unlimited retention, powerful queries, automatic migration

The system automatically selects the best storage on startup and seamlessly migrates data when cloud becomes available.

## How Storage Selection Works

On application startup (only once per restart):

1. **Check for `MONGO_URI` in `.env`**
   - If not configured → Use local CSV storage
   - If configured → Attempt MongoDB connection

2. **If MongoDB reachable:**
   - Initialize time-series collection
   - Scan `./logs/` for CSV files
   - Migrate all CSV data to MongoDB
   - Delete local CSV files
   - Use MongoDB for all future writes

3. **If MongoDB unreachable:**
   - Fall back to local CSV storage
   - Continue with 7-day retention
   - Migration will retry on next restart

## Setting Up MongoDB Atlas (Free)

### Step 1: Create Account and Cluster

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for free account
3. Create a new **FREE** cluster (M0 tier)
   - Choose cloud provider/region closest to your boat's typical location
   - Click "Create Cluster"

### Step 2: Configure Database Access

1. Go to **Security → Database Access**
2. Click **Add New Database User**
   - Authentication Method: Password
   - Username: `becoming` (or your choice)
   - Password: Generate a secure password (save it!)
   - Database User Privileges: "Read and write to any database"
3. Click **Add User**

### Step 3: Configure Network Access

1. Go to **Security → Network Access**
2. Click **Add IP Address**
3. Choose one:
   - **Option A** (Most flexible): Click "Allow Access from Anywhere" (`0.0.0.0/0`)
   - **Option B** (More secure): Add your boat's public IP or VPN endpoint
4. Click **Confirm**

### Step 4: Get Connection String

1. Go to **Database → Connect**
2. Choose **Drivers**
3. Select **Node.js** driver version **6.0 or later**
4. Copy the connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<username>` and `<password>` with your database user credentials

### Step 5: Configure Inverter Monitor

1. Edit `.env` file:
   ```bash
   nano ~/becoming/apps/inverter-monitor/.env
   ```

2. Add the MongoDB URI:
   ```env
   MONGO_URI=mongodb+srv://becoming:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/becoming?retryWrites=true&w=majority
   ```

3. Save and exit

### Step 6: Restart Application

```bash
# If running as systemd service
sudo systemctl restart inverter-monitor

# If running manually
# Stop with Ctrl+C, then:
npm start
```

### Step 7: Verify Migration

Watch the startup logs:

```bash
# For systemd service
sudo journalctl -u inverter-monitor -f

# You should see:
# MongoDB URI detected, attempting connection...
# ✓ MongoDB connected successfully
# Found X CSV file(s) to migrate
# ✓ Migration complete: XXX samples transferred to MongoDB
# Local CSV files deleted
```

## Checking MongoDB Data

### Using MongoDB Atlas Web UI

1. Go to **Database → Browse Collections**
2. Click your database (`becoming`)
3. Click `power` collection
4. View your data in the document viewer

### Using MongoDB Compass (Desktop App)

1. Download [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Connect using your connection string
3. Navigate to `becoming` → `power`
4. Use the aggregation pipeline builder for analysis

### Query Examples (MongoDB Shell)

```javascript
// Get last 24 hours of data
db.power.find({
  timestamp: { $gte: new ISODate(new Date().getTime() - 24*60*60*1000) }
}).sort({ timestamp: 1 })

// Average power consumption by hour today
db.power.aggregate([
  { $match: { 
    timestamp: { $gte: new ISODate(new Date().setHours(0,0,0,0)) }
  }},
  { $group: {
    _id: { $hour: "$timestamp" },
    avgDcPower: { $avg: "$dcPower" },
    avgAcPower: { $avg: "$acTotalPower" },
    avgSoc: { $avg: "$soc" }
  }},
  { $sort: { _id: 1 }}
])

// Total energy consumed this week (kWh)
db.power.aggregate([
  { $match: {
    timestamp: { $gte: new ISODate(new Date().getTime() - 7*24*60*60*1000) }
  }},
  { $group: {
    _id: null,
    totalWh: { $sum: { $multiply: ["$acTotalPower", 5/60] }}
  }},
  { $project: {
    _id: 0,
    totalKwh: { $divide: ["$totalWh", 1000] }
  }}
])
```

## Storage Backend Comparison

| Feature | CSV (Local) | MongoDB (Cloud) |
|---------|-------------|-----------------|
| **Internet Required** | No | Yes (for writes) |
| **Retention** | 7 days | Unlimited |
| **Storage Size** | ~200KB | ~20MB/year |
| **Query Performance** | Slow (file reads) | Fast (indexed) |
| **Aggregations** | Manual (bash/awk) | Native (pipeline) |
| **Remote Access** | No | Yes |
| **Backup** | Manual | Automatic |
| **Cost** | Free | Free (M0 tier) |
| **Best For** | Offline operation | Cloud connectivity |

## Migration Behavior Details

### What Gets Migrated

- All `power-YYYY-MM-DD.csv` files in `./logs/`
- Every sample row becomes one MongoDB document
- Timestamps are converted to `Date` objects
- Numeric fields are parsed to proper types

### Migration Safety

- **Non-destructive**: CSV files are only deleted AFTER successful MongoDB write
- **Atomic**: Each sample is written individually
- **Resumable**: If migration fails, CSV files remain, and migration retries on next restart
- **Idempotent**: Safe to restart during migration

### After Migration

- `./logs/` directory will be empty
- All new data goes directly to MongoDB
- No local disk usage for power logs
- Dashboard continues to work identically

## Fallback Behavior

If MongoDB becomes unreachable after initial setup:

- **During operation**: Current implementation will throw errors (future: buffer writes)
- **On restart**: Falls back to CSV storage
- **Data loss**: Any in-flight data since last successful write

**Best Practice**: Ensure reliable internet connectivity before deploying MongoDB storage for production use.

## Troubleshooting

### "MongoDB connection failed" on startup

**Possible causes:**

1. **Network issues**: Check internet connectivity
   ```bash
   ping 8.8.8.8
   ```

2. **Wrong credentials**: Verify username/password in connection string

3. **IP not whitelisted**: Check MongoDB Atlas → Network Access

4. **DNS issues**: Try replacing `cluster0.xxxxx.mongodb.net` with the direct IP

**Solution**: The app will automatically fall back to CSV. Fix the issue and restart.

### Migration seems stuck

Check the logs:

```bash
sudo journalctl -u inverter-monitor -n 100
```

If you see repeated `Migrating...` messages:
- MongoDB write might be slow
- Wait for completion or check MongoDB Atlas performance metrics

### Want to re-migrate data after deleting MongoDB collection

1. Stop the app
2. Restore CSV files from backup (if you have them)
3. Drop the MongoDB `power` collection in Atlas
4. Restart the app

### CSV files keep accumulating even with MongoDB configured

- Check that `MONGO_URI` is correctly set in `.env`
- Verify MongoDB connection succeeded in logs
- Ensure migration completed (look for "✓ Migration complete")

## Future Enhancements

Planned improvements:

- **Write buffering**: Queue writes when MongoDB is temporarily unreachable
- **Hybrid mode**: Keep recent data in CSV as backup while also writing to MongoDB
- **Compression**: Enable MongoDB time-series compression for reduced storage
- **Encryption**: Support MongoDB client-side field encryption for sensitive data

## Cost Estimate

**MongoDB Atlas M0 (Free Tier)**:
- Storage: 512 MB (enough for ~25 years of power data)
- RAM: Shared
- Bandwidth: Reasonable limits for this use case
- **Cost: $0/month**

**If you outgrow M0**:
- M2 Shared: $9/month (2 GB storage)
- M5 Dedicated: $25/month (5 GB storage, better performance)

For the inverter monitor's data volume (~20 MB/year), the **free tier is sufficient indefinitely**.

## Support

For issues or questions:
1. Check logs: `sudo journalctl -u inverter-monitor -f`
2. Verify `.env` configuration
3. Test MongoDB connection string separately
4. Consult MongoDB Atlas documentation

---

**Quick Start**: Just add `MONGO_URI` to `.env` and restart. The system handles the rest automatically.
