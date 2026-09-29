# B-CHAPLET-OFF-HOTFIX — SCOPE (hotfix path, `workflow-hotfix`)

change-class: hotfix

**Owner:** Infra Claude (CC-INFRA) · **Opened:** 2026-09-29 · **Issue:** `#1101` · **Ordered by:** Langston, 2026-09-29 ~16:0xZ (*"Unmount = hotfix, now… This is mine to approve, not Kyle's — it moves no risk or authority outward, it reduces exposure, and there is no live consumer."*). Kyle was told at the same time.

## 1. QUALIFYING TEST (all three)
1. **Broken now:** an unauthenticated route on staging, `/chaplet`, serves files from the deployed tree (repo content, chat archives, `backups and data dumps/`) to the public internet (`#1101`; Langston confirmed it live from his box: `GET https://188.245.193.8.sslip.io/chaplet/health` → 200).
2. **Waiting causes real harm:** every hour it stays mounted, the private chat history and database backups Kyle chose to keep (D2 of `B-CREDENTIALS-PRIVATE-REPO`) are publicly downloadable, whatever the GitHub repo's visibility.
3. **Blast radius small and proven:** §2 below.

## 2. AUDIT — PATH A (the finding comes from a completed audit)
**Cited:** `B-CREDENTIALS-PRIVATE-REPO` Step-2 audit readers (Groups D and E, 2026-09-29), confirmed at the code by me and live by Langston; `RUNNING_ISSUES.md` `#1101`. **Mechanism:** `server/index.ts:13` imports `../chaplet/index.js`; `server/index.ts:503` mounts it at `/chaplet` with no auth middleware; nginx `location /` → app, Caddy → nginx.
**Census (at `origin/migration/aws-supabase`, repo-wide, tests excluded):**
- **who mounts / schedules it:** exactly ONE site, `server/index.ts:503` (plus the import at `:13`). No timer, cron or `.start()`.
- **who calls it:** **none in code.** Repo references: `bridge/runtime/repo-map.json:40-41` (a descriptive map entry), `.dockerignore:40`, `scripts/codex-export/MANIFEST.txt:73` (a comment). No client code, no script, no unit calls `/chaplet`. **Live:** nginx logs 2026-09-15 → 09-29 show `/chaplet` requests ONLY on 2026-09-29: the audit reader's status probe at 15:00:27Z and Langston's health check at 16:01:14Z.
- **what state it writes:** none (read-only file serving). So no reader can be left orphaned (§9.5(a-ii) satisfied).
- **who deletes / mutates:** n/a.
**Ledger:** `chaplet` has no other entry in `RUNNING_ISSUES`, `BATCH_CATALOG` or the completion reports. `SYSTEM_MANUAL.md:7297` lists it as *"Chaplet routes at /chaplet (read-only)"*, the only governance mention (updated at deletion).
**Larger fault?** The larger fault — an old, unauthenticated router left mounted — is exactly what `B-CHAPLET-DELETE` (the deletion batch Langston placed) and `B-SEC-HARDEN`'s route census address. This hotfix only closes the exposure.

## 3. THE FIX — two parts, because staging cannot take a normal deploy right now
Staging runs `bc199185e`, which is ≥72 h behind the review branch (deploy-drift rungs 2/3/4 active), and other sessions' work is held off staging deliberately (CC-C's hold until 2026-10-02 evening for the xStock measurement window). **A `dt-deploy` of this commit would ship all of that.** So:
- **(a) EDGE BLOCK, applied now, after Langston's review:** in the live `/etc/nginx/sites-available/dawntrader`, before `location /`:
  ```
      # B-CHAPLET-OFF-HOTFIX (#1101): the unauthenticated /chaplet router is closed at the edge.
      location ^~ /chaplet {
          return 404;
      }
  ```
  Backed up first to `/etc/nginx/sites-available/dawntrader.pre-chaplet-off-<UTC>`; `nginx -t`, then `systemctl reload nginx` (graceful, no dropped connections, **the app is not restarted**). **Rollback:** restore the backup and reload. External access to the app port is already blocked by the firewall (ufw 22/80/443 only), so the edge is the only public path.
- **(b) CODE UNMOUNT, pushed now, deployed with the next normal `dt-deploy`:** `server/index.ts` loses the import (`:13`) and the mount (`:502-504`), with a comment pointing at `#1101` and `B-CHAPLET-DELETE`. The `chaplet/` folder stays until `B-CHAPLET-DELETE` (rule 18, its own batch, placed by Langston).

## 4. VERIFICATION (the same instrument that showed it)
- **(a) now:** from Helsinki (outside), `GET https://188.245.193.8.sslip.io/chaplet/health` → **404** (it was 200 at 16:01Z), and `/chaplet/repo/file/package.json` → **404** (it was 200 at 15:00Z). **Controls:** `GET /` still 200, and an `/api/…` route with no token still 401, so the edge change blocked only `/chaplet`.
- **(b) at the next deploy:** the app log no longer prints `Chaplet mounted at /chaplet`, and `localhost:5000/chaplet/health` returns the app's 404.

## 5. RECORD
`CHANGES_AND_FIXES.md` entry · `RUNNING_ISSUES.md` `#1101` updated (exposure closed at the edge; code unmount pending deploy; deletion homed) · `BATCH_CATALOG.md` row · a short completion note. **Found here and homed (§9.4):** the repo's `deploy/nginx.conf` is a stale Batch-40 template (111 lines, last changed `02e18f208`, 2026-03-30) that does not match the live 99-line config. Staging's edge config has no canonical copy in the repo, which is disposition 2 → `B-SEC-HARDEN`.
