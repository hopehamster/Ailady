#!/usr/bin/env bash
# sync-tracking.sh (#10) — deterministic tracking sync: GitHub Projects board + Obsidian vault.
# Run at checkpoint time (or ad-hoc): `pnpm sync:tracking`. Safe + idempotent + additive:
# never deletes, never commits, never touches git beyond reads.
#
# Does the MECHANICAL, judgment-free parts of keeping tracking coherent:
#   1. GitHub Projects board: any CLOSED issue on the board not marked Done → set Done.
#      (open/closed → Done is deterministic; Todo↔In-Progress stays a human/checkpoint call.)
#   2. Obsidian mirror: copy new/changed ops/aria/log/*.md session logs → aria-mind/work/sessions/,
#      then `qmd update` so the vault's semantic search sees them.
#
# What it does NOT do (needs judgment — stays with the checkpoint/me): write log CONTENT,
# post evidence comments (aria-checkpoint does that), decide Todo↔In-Progress, or commit.

set -uo pipefail
REPO="${REPO:-c:/Users/Owner/Documents/GitHub/Ailady_clean_20260327}"
VAULT="${ARIA_VAULT:-C:/Users/Owner/Documents/Obsidian/aria-mind}"
GH_REPO="hopehamster/Ailady_clean_20260327"
PROJECT_NUM=4
PROJECT_OWNER=hopehamster
DRY="${1:-}"

log() { echo "[sync-tracking] $*"; }

# ── 1. GitHub Projects board: closed issues → Done ──────────────────────────────
sync_board() {
  command -v gh >/dev/null 2>&1 || { log "gh not found — skipping board"; return; }
  local proj_id status_field done_opt
  # resolve project node-id + Status field + Done option (dynamic → survives field-id changes)
  proj_id=$(gh project list --owner "$PROJECT_OWNER" --format json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const p=(j.projects||[]).find(x=>x.number==='"$PROJECT_NUM"');console.log(p?p.id:"")})')
  [ -z "$proj_id" ] && { log "project #$PROJECT_NUM not found — skipping board"; return; }
  read -r status_field done_opt < <(gh project field-list "$PROJECT_NUM" --owner "$PROJECT_OWNER" --format json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const f=(j.fields||[]).find(x=>x.name==="Status");const o=f&&(f.options||[]).find(x=>x.name==="Done");console.log((f?f.id:"")+" "+(o?o.id:""))})')
  [ -z "$status_field" ] || [ -z "$done_opt" ] && { log "Status/Done field not found — skipping board"; return; }

  # closed issue numbers
  local closed; closed=$(gh issue list --repo "$GH_REPO" --state closed --limit 200 --json number --jq '[.[].number]' 2>/dev/null)
  # board items: number → {itemId,status}
  local n=0
  gh project item-list "$PROJECT_NUM" --owner "$PROJECT_OWNER" --limit 100 --format json 2>/dev/null \
    | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        const j=JSON.parse(s), closed=new Set('"$closed"');
        for(const it of j.items){ const num=it.content&&it.content.number;
          if(num && closed.has(num) && it.status!=="Done") console.log(it.id+"\t"+num); }
      });' \
    | while IFS=$'\t' read -r itemid num; do
        [ -z "$itemid" ] && continue
        if [ "$DRY" = "--dry" ]; then log "would set #$num → Done"; else
          gh project item-edit --project-id "$proj_id" --id "$itemid" --field-id "$status_field" --single-select-option-id "$done_opt" >/dev/null 2>&1 \
            && log "#$num → Done (was open-on-board→closed)"
        fi
        n=$((n+1))
      done
  log "board: closed-but-not-Done reconciled"
}

# ── 2. Obsidian mirror: session logs → vault + reindex ──────────────────────────
sync_obsidian() {
  local src="$REPO/ops/aria/log" dest="$VAULT/work/sessions"
  [ -d "$src" ] || { log "no log dir — skipping obsidian"; return; }
  [ -d "$dest" ] || { log "vault sessions dir missing ($dest) — skipping obsidian"; return; }
  local copied=0
  for f in "$src"/*.md; do
    [ -e "$f" ] || continue
    case "$(basename "$f")" in *-STUB.md) continue;; esac   # skip fallback stubs
    local t="$dest/$(basename "$f")"
    if [ ! -e "$t" ] || [ "$f" -nt "$t" ]; then
      if [ "$DRY" = "--dry" ]; then log "would mirror $(basename "$f")"; else cp "$f" "$t" && copied=$((copied+1)); fi
    fi
  done
  log "obsidian: $copied log(s) mirrored → work/sessions/"
  if [ "$DRY" != "--dry" ] && command -v qmd >/dev/null 2>&1; then
    ( qmd --index obsidian-mind update >/dev/null 2>&1 || qmd update >/dev/null 2>&1 ) && log "qmd reindexed" || log "qmd reindex skipped (index not configured — run: qmd collection add \"$VAULT\")"
  fi
}

log "start${DRY:+ (dry-run)}"
sync_board
sync_obsidian
log "done"
