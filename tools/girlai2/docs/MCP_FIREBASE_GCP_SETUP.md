# Firebase & Google Cloud MCP Tools Setup

This document describes the MCP (Model Context Protocol) tools available for Firebase and Google Cloud Platform, enabling autonomous development and operations.

## Status

✅ **GCP MCP** - Configured and working  
✅ **Firebase MCP** - Configured (may need verification)

## Available Tools

### Google Cloud Platform (GCP) MCP

**Server:** `gcp` (via `gcp-mcp` package)

**Configuration:**
```json
{
  "gcp": {
    "command": "npx",
    "args": ["-y", "gcp-mcp"],
    "env": {
      "GOOGLE_CLOUD_PROJECT": "girlai2"
    }
  }
}
```

**Available Tools:**
- `list-projects` - List all accessible GCP projects
- `select-project` - Set active GCP project for operations
- `list-gke-clusters` - List Google Kubernetes Engine clusters
- `list-sql-instances` - List Cloud SQL database instances
- `get-billing-info` - Get billing information
- `get-billing-budget` - Get budget information
- `get-cost-forecast` - Get cost forecasting data
- `get-logs` - Query Cloud Logging entries
- `run-gcp-code` - Execute code in GCP environment

**Use Cases:**
- Monitor Cloud Logging for errors and debugging
- Check billing and costs
- Manage GCP resources
- Query project information
- Execute operations on GCP services

### Firebase MCP

**Server:** `firebase` (via `firebase-tools`)

**Configuration:**
```json
{
  "firebase": {
    "command": "npx",
    "args": ["-y", "firebase-tools@latest", "mcp"]
  }
}
```

**Available Tools (from Firebase documentation):**
- Create and manage Firebase projects
- Manage Firebase Authentication users
- Work with data in Cloud Firestore
- Retrieve Firebase Data Connect schemas
- Understand security rules for Firestore and Cloud Storage
- Send messages with Firebase Cloud Messaging
- Manage Firebase Functions
- Configure Firebase services

**Use Cases:**
- Manage Firebase Authentication users
- Query and update Firestore data
- Deploy and manage Cloud Functions
- Configure Firebase services
- Test Firebase emulators
- Manage security rules

## Authentication

Both MCP servers use the same authentication as the Firebase CLI:
- **User credentials**: Logged-in user via `firebase login`
- **Application Default Credentials**: Service account credentials

To authenticate:
```powershell
firebase login
```

## Project Configuration

**Firebase Project:** `girlai2` (configured in `.firebaserc`)

**GCP Project:** Should match Firebase project (`girlai2`)

To set GCP project:
```powershell
# Via MCP tool
select-project({ projectId: "girlai2" })
```

## Example Usage

### Query Cloud Logging
```typescript
// Get recent error logs
get-logs({
  filter: "severity>=ERROR",
  pageSize: 20
})
```

### List GCP Resources
```typescript
// List all projects
list-projects({})

// List SQL instances
list-sql-instances({})

// List GKE clusters
list-gke-clusters({})
```

### Firebase Operations
```typescript
// Firebase MCP tools are available via the firebase server
// Specific tool names depend on Firebase MCP implementation
```

## Troubleshooting

### GCP MCP Not Working
1. Verify `GOOGLE_CLOUD_PROJECT` is set correctly
2. Ensure Firebase CLI is authenticated: `firebase login`
3. Check GCP project exists and is accessible

### Firebase MCP Not Working
1. Verify Firebase CLI is installed: `firebase --version`
2. Authenticate: `firebase login`
3. Check project is set: `firebase projects:list`
4. Verify MCP server starts: Check Cursor MCP logs

### Authentication Issues
```powershell
# Re-authenticate Firebase
firebase logout
firebase login

# Verify access
firebase projects:list
```

## Integration with Development Workflow

These MCP tools enable autonomous operations:

1. **Debugging**: Query Cloud Logging to find errors
2. **Monitoring**: Check billing and resource usage
3. **Deployment**: Manage Firebase Functions and services
4. **Data Management**: Query and update Firestore data
5. **User Management**: Manage Firebase Auth users
6. **Configuration**: Update security rules and indexes

## Next Steps

- Test Firebase MCP tools to verify all capabilities
- Document specific Firebase MCP tool names and parameters
- Create automation workflows using these tools
- Set up monitoring and alerting via GCP MCP
