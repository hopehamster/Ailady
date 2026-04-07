# Claude Commands

Common repo commands:

## Catch up

```powershell
.\scripts\resume.ps1
```

## Sync generated adapter files

```powershell
.\scripts\sync-agent-adapters.ps1
```

## Backend verification

```powershell
Set-Location tools\girlai2\functions
npm run build
npm test
```

## Scoped checkpoint

```powershell
$paths=@(
  'path1',
  'path2'
)
.\scripts\checkpoint-work.ps1 -Message 'Checkpoint message' -OnlyPaths $paths
```
