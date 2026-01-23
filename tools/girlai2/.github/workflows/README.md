# GitHub Actions Workflows

This directory contains CI/CD workflows for the AI Girlfriend app.

## Workflows

### `test.yml`
Lightweight unit test runner that runs on every push and pull request.
- Fast execution (unit tests only)
- Generates coverage reports
- Uploads to Codecov

**Use case:** Quick feedback on code changes

### `ios-build-test.yml`
Comprehensive build and test workflow with multiple jobs:
- **unit-tests**: Flutter unit tests with coverage
- **build-ios**: iOS Profile build verification
- **test-functions**: Cloud Functions testing with emulators
- **integration-test**: Full integration tests with emulators
- **deploy-functions**: Auto-deploy functions on main branch

**Use case:** Full validation before merging to main

## Workflow Relationships

```
test.yml (lightweight)
    ↓
ios-build-test.yml (comprehensive)
    ├─ unit-tests
    ├─ build-ios (depends on unit-tests)
    ├─ test-functions
    ├─ integration-test (depends on unit-tests, build-ios)
    └─ deploy-functions (depends on test-functions, integration-test)
```

## Secrets Required

### For Deployment (`deploy-functions` job)
- `FIREBASE_SERVICE_ACCOUNT`: JSON service account key for Firebase
  - Get from: Firebase Console → Project Settings → Service Accounts
  - Add to: GitHub → Settings → Secrets → Actions

## Manual Triggering

Both workflows support manual triggering via GitHub Actions UI:
- Go to Actions tab
- Select workflow
- Click "Run workflow"

## Troubleshooting

### Workflow fails on emulator setup
- Emulators are downloaded on first run (may take time)
- Check logs for specific emulator installation errors

### Functions deployment fails
- Verify `FIREBASE_SERVICE_ACCOUNT` secret is set
- Check Firebase project ID matches `.firebaserc`
- Ensure service account has Functions Admin role

### Build artifacts not uploaded
- Check artifact size limits (10GB per workflow)
- Verify build actually succeeded before upload step
