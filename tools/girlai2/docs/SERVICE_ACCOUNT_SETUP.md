# Service Account Setup for Firebase & GCP MCP

This guide will help you create a service account with appropriate permissions for Firebase and GCP operations, enabling persistent authentication that doesn't expire.

## Why Service Account?

- ✅ **No expiration** - Unlike user credentials, service account keys don't expire
- ✅ **Better for automation** - Perfect for CI/CD and autonomous operations
- ✅ **Granular permissions** - Can be scoped to specific operations
- ✅ **Secure** - Can be rotated and managed independently

## Step-by-Step Setup

### Step 1: Create Service Account in Google Cloud Console

1. **Open Google Cloud Console**
   - Go to: https://console.cloud.google.com/
   - Select project: `girlai2`

2. **Navigate to Service Accounts**
   - Go to: **IAM & Admin** → **Service Accounts**
   - Or direct link: https://console.cloud.google.com/iam-admin/serviceaccounts?project=girlai2

3. **Create New Service Account**
   - Click **"+ CREATE SERVICE ACCOUNT"**
   - **Service account name**: `firebase-mcp-automation`
   - **Service account ID**: (auto-generated, keep as is)
   - **Description**: `Service account for Firebase and GCP MCP tools automation`
   - Click **"CREATE AND CONTINUE"**

### Step 2: Grant Permissions

Add the following roles (click **"+ ADD ANOTHER ROLE"** for each):

**Required Roles:**
1. **Firebase Admin** (`roles/firebase.admin`)
   - Full Firebase project management
   - Required for Firebase MCP operations

2. **Cloud Functions Admin** (`roles/cloudfunctions.admin`)
   - Deploy and manage Cloud Functions
   - View function logs

3. **Cloud Logging Viewer** (`roles/logging.viewer`)
   - Read Cloud Logging entries
   - Required for GCP MCP `get-logs` tool

4. **Firestore Service Agent** (`roles/datastore.user`)
   - Read/write Firestore data
   - Required for Firestore operations

5. **Service Account User** (`roles/iam.serviceAccountUser`)
   - Use service accounts
   - Required for some operations

**Optional but Recommended:**
6. **Billing Viewer** (`roles/billing.viewer`)
   - View billing information
   - Required for GCP MCP billing tools

7. **Storage Admin** (`roles/storage.admin`)
   - Manage Firebase Storage
   - If using Storage features

After adding all roles, click **"CONTINUE"**

### Step 3: Grant User Access (Optional)

- **Grant this service account access to the project**: Leave unchecked (not needed for MCP)
- Click **"DONE"**

### Step 4: Create and Download Key

1. **Find Your Service Account**
   - In the Service Accounts list, find `firebase-mcp-automation`
   - Click on the service account name

2. **Create Key**
   - Go to **"KEYS"** tab
   - Click **"+ ADD KEY"** → **"Create new key"**
   - Select **JSON** format
   - Click **"CREATE"**
   - The JSON key file will download automatically

3. **Save the Key File**
   - **IMPORTANT**: Save this file securely!
   - Recommended location: `C:\Users\Owner\Documents\GitHub\Ailady\tools\girlai2\service-account-key.json`
   - **DO NOT** commit this file to Git (it should be in `.gitignore`)

### Step 5: Configure Environment Variable

1. **Set Environment Variable**
   - Open **Environment Variables** (search in Start menu)
   - Under **"User variables"**, click **"New"**
   - **Variable name**: `GOOGLE_APPLICATION_CREDENTIALS`
   - **Variable value**: `C:\Users\Owner\Documents\GitHub\Ailady\tools\girlai2\service-account-key.json`
   - Click **"OK"**

2. **Verify in PowerShell** (restart PowerShell after setting env var)
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS
   # Should show: C:\Users\Owner\Documents\GitHub\Ailady\tools\girlai2\service-account-key.json
   ```

### Step 6: Update MCP Configuration

The MCP servers will automatically use the service account when `GOOGLE_APPLICATION_CREDENTIALS` is set. No changes needed to `mcp.json` - it will use Application Default Credentials.

### Step 7: Test Authentication

1. **Test Firebase CLI**
   ```powershell
   cd C:\Users\Owner\Documents\GitHub\Ailady\tools\girlai2
   firebase projects:list
   ```
   Should list projects without asking for login.

2. **Test GCP Access**
   ```powershell
   # This will use the service account automatically
   gcloud auth application-default print-access-token
   ```

3. **Test MCP Tools**
   - Restart Cursor to reload MCP servers
   - MCP tools should now work with service account

## Security Best Practices

### 1. Protect the Key File
- ✅ Store in secure location (not in public repos)
- ✅ Set file permissions (Windows: Right-click → Properties → Security)
- ✅ Add to `.gitignore` (already done)

### 2. Rotate Keys Regularly
- Rotate service account keys every 90 days
- Create new key, update `GOOGLE_APPLICATION_CREDENTIALS`, delete old key

### 3. Minimal Permissions
- Only grant permissions actually needed
- Review permissions periodically
- Remove unused roles

### 4. Monitor Usage
- Check Cloud Logging for service account activity
- Set up alerts for unusual activity

## Troubleshooting

### "Permission Denied" Errors

**Issue**: Service account doesn't have required permissions
**Solution**: 
1. Go to Service Account in Console
2. Check "PERMISSIONS" tab
3. Add missing roles

### "Invalid Credentials"

**Issue**: Environment variable not set or wrong path
**Solution**:
```powershell
# Check if set
$env:GOOGLE_APPLICATION_CREDENTIALS

# Set if missing
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\Owner\Documents\GitHub\Ailady\tools\girlai2\service-account-key.json"

# Verify file exists
Test-Path $env:GOOGLE_APPLICATION_CREDENTIALS
```

### Firebase CLI Still Asking for Login

**Issue**: Firebase CLI might be using cached user credentials
**Solution**:
```powershell
# Clear Firebase cache
firebase logout
# Now it should use service account
firebase projects:list
```

### MCP Tools Not Working

**Issue**: MCP servers need restart to pick up new credentials
**Solution**:
1. Restart Cursor completely
2. Check MCP server logs for errors
3. Verify `GOOGLE_APPLICATION_CREDENTIALS` is set

## Quick Reference

### Service Account Details
- **Name**: `firebase-mcp-automation`
- **Email**: `firebase-mcp-automation@girlai2.iam.gserviceaccount.com`
- **Key Location**: `C:\Users\Owner\Documents\GitHub\Ailady\tools\girlai2\service-account-key.json`
- **Environment Variable**: `GOOGLE_APPLICATION_CREDENTIALS`

### Required IAM Roles
- `roles/firebase.admin`
- `roles/cloudfunctions.admin`
- `roles/logging.viewer`
- `roles/datastore.user`
- `roles/iam.serviceAccountUser`
- `roles/billing.viewer` (optional)

### Test Commands
```powershell
# Test Firebase
firebase projects:list

# Test GCP
gcloud auth application-default print-access-token

# Verify env var
$env:GOOGLE_APPLICATION_CREDENTIALS
```

## Next Steps

After setup:
1. ✅ Test Firebase CLI access
2. ✅ Test GCP MCP tools
3. ✅ Test Firebase MCP tools
4. ✅ Verify autonomous operations work
5. ✅ Document key rotation schedule

---

**Created**: 2026-01-24  
**Project**: girlai2  
**Service Account**: firebase-mcp-automation
