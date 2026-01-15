# Redis Connection URL Help

## Current Status

You provided: `A1saqafblfgul3rn8tvmke7ikfga35c7sks3hwdgqslmt4hutwq`

This appears to be a password or token. We need the full connection URL.

## Redis Connection URL Format

### Standard Format
```
redis://[username]:[password]@[host]:[port]
```

### Examples

**Redis Cloud:**
```
redis://default:YOUR_PASSWORD@YOUR_ENDPOINT.c1.cloud.redislabs.com:12345
```

**Local Redis:**
```
redis://localhost:6379
```

**Redis with SSL:**
```
rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.c1.cloud.redislabs.com:12345
```

## Where to Find Your Full Redis URL

### If using Redis Cloud:
1. Log into https://redis.com/
2. Go to your database
3. Look for "Endpoint" or "Connection String"
4. Copy the full URL

### If using AWS ElastiCache:
1. Go to AWS Console > ElastiCache
2. Select your cluster
3. Get the endpoint and port
4. Format: `redis://YOUR_ENDPOINT:6379`

### If using local Redis:
```
redis://localhost:6379
```

## Update .env File

Once you have the full URL, update `functions/.env`:

```bash
REDIS_URL=redis://default:A1saqafblfgul3rn8tvmke7ikfga35c7sks3hwdgqslmt4hutwq@YOUR-HOST:PORT
```

Replace `YOUR-HOST:PORT` with your actual Redis host and port.

## Test Connection

After updating, you can test the connection by running the Cloud Functions locally or checking the logs when functions start.
