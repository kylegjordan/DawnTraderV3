# DawnTrader Architecture & Migration Plan

**Author:** Langston  
**Date:** 2026-03-28  
**Purpose:** Proposed target-state architecture and migration plan for moving DawnTrader away from Replit-centered development and into a more robust AWS + Supabase + GitHub environment, while preserving Kyle’s preferred Claude Desktop/Max workflow and improving 3-way collaboration.

---

# 1. Executive Summary

## Recommendation

DawnTrader should move away from Replit as the primary development, deployment, and operational center.

I recommend a staged migration to:

- **GitHub** as the canonical source of truth for code
- **AWS** as the application / staging / agent infrastructure host
- **Supabase** as the managed PostgreSQL database layer
- **A browser-accessible staging domain** as Kyle’s preview/testing environment
- **A persistent cloud-side collaboration model** so Claude Code can become a more reachable participant in the workflow

## Why

The project has outgrown the operational shape of Replit. Replit helped get DawnTrader moving, but it is now introducing avoidable friction in:

- deployment reliability
- debugging quality
- queue/session management
- shell/log access
- coordination between Kyle, Langston, and Claude Code
- preview/deploy/test governance

## Core Goal

Preserve the capabilities Kyle values most:

- easy human-facing interaction with Claude Desktop / Claude Max
- browser-based preview/testing of the app
- visibility into what is running
- straightforward collaboration

While replacing the parts that are currently fragile:

- Replit-centered deployment and verification
- UI automation dependence
- laptop-bound/reactive Claude Code workflow
- awkward inbox/relay-only 3-way setup

---

# 2. Problems This Plan Is Solving

## 2.1 Replit-Centered Operational Friction

Current pain points include:

- Replit Agent queue confusion
- prompt truncation / partial submission issues
- browser automation fragility
- indirect shell access
- limited observability compared to direct server access
- extra governance overhead caused by the Replit boundary

## 2.2 Claude Code Reachability Problem

Current state:

- Claude Code is effectively tied to Kyle’s laptop/Desktop session
- Claude Code is reactive, not persistently reachable by Langston
- 3-way discussions require manual activation and polling
- Claude Code is not yet a first-class always-available participant in the system

## 2.3 Environment Coupling Problem

Replit currently bundles too many concerns together:

- repository
- development environment
- preview app
- production runtime behavior
- database dependence

For a serious trading platform, those concerns should be separated cleanly.

## 2.4 Future Product Expansion

DawnTrader is expected to evolve from:

- single-operator usage (Kyle)

into:

- multi-user access
- separate user accounts
- separate exchange credentials
- production-grade authentication / authorization
- eventually ML and AI-assisted workflows layered on top

That future is better served by a proper cloud architecture than by an all-in-one Replit workflow.

---

# 3. Design Principles

The target architecture should satisfy the following:

1. **GitHub is the source of truth for code**
2. **Kyle keeps a comfortable primary interface** (Claude Desktop / Claude Max)
3. **Kyle gets a stable browser-based staging preview**
4. **Claude Code and Langston have direct operational visibility**
5. **Dev / staging / production are clearly separated**
6. **Agent infrastructure is isolated from production**
7. **The system supports future multi-user SaaS behavior**
8. **The database layer is managed and scalable**
9. **Migration happens in stages, not as a big-bang cutover**
10. **Google Drive remains available for backups, reports, and governance artifacts**

---

# 4. Recommended Target Architecture

## 4.1 Core Stack

### Source Control
- **GitHub private repository**
- Canonical source of truth for all application code

### Application / Infrastructure Host
- **AWS account**
- Primary compute hosted on **EC2** instances

### Database Layer
- **Supabase PostgreSQL**
- Initially used primarily as managed Postgres
- Additional Supabase features (auth, storage, policies) adopted intentionally if useful

### DNS / Domain / SSL
- Domain managed via registrar + preferably **Cloudflare** for DNS/proxy convenience
- SSL via Let’s Encrypt or Cloudflare-supported setup

### Backups / Governance / Reports
- **Google Drive** remains in use for:
  - governance docs
  - reports
  - archived packages
  - backup snapshots / exports as appropriate

---

# 5. Environment Layout

## 5.1 AWS Account Model

Everything can live under **one AWS account**.

Separate AWS accounts are **not required**.

Isolation is achieved with:

- separate EC2 instances
- security groups
- IAM roles
- environment variables / secrets
- database roles / schemas / instances as needed
- subdomains
- deployment boundaries

## 5.2 Recommended Initial Compute Layout

### EC2 Instance A — Agent / Dev / Staging
This instance hosts:

- Langston / OpenClaw infrastructure
- Claude Code cloud-side working environment (future-state target)
- development workspace(s)
- staging deployment target
- application logs and operational scripts
- reverse proxy for dev/staging subdomains

### EC2 Instance B — Production
This instance hosts:

- production application runtime
- production reverse proxy
- production process manager
- production environment variables / secrets
- production-only deployment target

## 5.3 Optional Future Compute Layout

### EC2 Instance C — ML / Workers / Heavy Jobs
Add later only if needed for:

- training jobs
- batch workers
- inference tasks
- heavier compute isolation

---

# 6. Domain / Subdomain Plan

Example structure:

- `dawntrader.com` → production application
- `staging.dawntrader.com` → staging preview site for Kyle
- `dev.dawntrader.com` → optional dev preview site (if needed)
- `api.dawntrader.com` → optional dedicated API endpoint later

Notes:
- Production and staging should be clearly separated
- Staging can be password protected or login-gated
- Dev preview may remain internal only if preferred

---

# 7. Claude Code Future-State Role

## 7.1 What Should Stay the Same for Kyle

Kyle should ideally keep:

- Claude Desktop / Claude Max as his preferred human-facing interface
- easy file/image/screenshot uploads
- a rich UI instead of being forced into raw terminal-only interaction

## 7.2 What Should Change Under the Hood

Claude Code should evolve from:

- laptop-bound
- manually activated
- reactive-only
- inbox-polled participant

into:

- a more persistent cloud-side participant
- working directly against the real repo/environment
- reachable by system workflow and orchestration
- easier to bring into discussions without manual session gymnastics

## 7.3 Collaboration Goal

Target collaboration model:

- Kyle can initiate a discussion from phone or desktop
- Langston can bring Claude Code into the conversation
- Claude Code can be notified and join from a persistent environment
- context is shared more cleanly
- fewer manual handoffs are required

## 7.4 Important Constraint

This plan does **not** require replacing Kyle’s Claude Desktop / Max workflow with raw API as the primary human interface.

The preferred goal is:

- preserve Kyle’s comfortable front-end experience
- improve the backend collaboration topology

---

# 8. GitHub Workflow Recommendation

## 8.1 Source of Truth

GitHub becomes the canonical repository.

## 8.2 Development Model

Recommended model:

- main branch / protected branch policy as appropriate
- feature branches or worktrees for active tasks
- staging deployment from an approved branch
- production deployment from a controlled release branch or tagged state

## 8.3 Governance Alignment

The current governance system will need adjustment because it was built around the Replit zip/apply boundary.

However, governance principles remain valid:

- scope first
- implementation reviewed
- verification before closure
- documentation/governance updates maintained
- no silent drift from intent

Migration should preserve those principles while simplifying the delivery mechanics.

---

# 9. Database Recommendation

## 9.1 Supabase Role

Supabase should initially be used primarily as:

- managed PostgreSQL
- structured application data store
- clean foundation for future user/account management

## 9.2 Why Supabase Fits

Supabase is a strong fit because it supports:

- managed Postgres
- schema-based multi-user data modeling
- future auth/user flows if chosen
- cleaner growth path than a database hidden inside Replit

## 9.3 Important Caution

Do **not** let Supabase define the whole architecture accidentally.

Recommendation:

- adopt Supabase intentionally
- use what helps
- avoid unnecessary platform lock-in at the application-design level

---

# 10. Multi-User Future Compatibility

The target architecture should support a future where:

- users can sign up and log in independently
- each user has isolated account data
- each user stores their own Kraken/API credentials securely
- Kyle does not know user passwords
- Kyle does not directly handle user exchange credentials
- user settings, signals, trades, and records are logically separated

This is fully compatible with AWS + Supabase.

## Requirements for That Future

- proper auth
- user/account tables
- secure storage/encryption for exchange secrets
- authorization boundaries
- careful per-user data ownership design
- future operational handling for account-scoped jobs and actions

---

# 11. ML / AI Compatibility

## 11.1 Current Recommendation

AWS EC2 + Supabase is still a strong base architecture even if DawnTrader later adds:

- machine learning
- model-assisted ranking/inference
- AI/natural language interaction layers

## 11.2 Likely Future Additions

Later, DawnTrader may also need:

- S3 for artifacts / model files / exports
- background worker processes
- a queue layer
- dedicated inference services
- possibly separate compute for heavier ML workloads

These are additive expansions, not reasons to reject the EC2 + Supabase foundation.

---

# 12. Recommended Operational Separation

## 12.1 Early Migration Phase

Keep separation logical and clean even if cost is controlled:

- Agent / Dev / Staging together on one EC2 instance
- Production on separate EC2 instance
- Supabase externalized as DB layer

## 12.2 Why Not Everything on One Giant Box?

A single giant shared host is possible, but less desirable because it creates risk around:

- resource contention
- accidental cross-environment impact
- security boundary weakness
- harder rollback / restart behavior
- larger blast radius when something fails

For a trading system, boring isolation is preferable.

---

# 13. Security / Access Principles

## 13.1 Access Model

The target system should allow:

- Kyle access to staging preview in browser
- Kyle continued use of Claude Desktop / Max as primary interface
- Langston access to logs / services / repo / staging visibility
- Claude Code access to repo/workspaces and relevant environment context

## 13.2 Security Practices

- secrets kept outside repo
- separate env files / secret stores by environment
- separate production credentials from staging/dev
- restricted SSH / operational access
- DB roles separated appropriately
- production data not reused casually in staging

---

# 14. Migration Plan (Staged)

## Phase 0 — Architecture Review

Goals:
- validate this plan with Claude Code
- identify technical holes / hidden dependencies
- inventory the current Replit-specific assumptions in DawnTrader

Deliverables:
- reviewed architecture plan
- risk list
- migration prerequisites

## Phase 1 — Current-State Audit

Audit and document:

- current app runtime requirements
- environment variables / secrets
- current database shape and dependencies
- any Replit-specific assumptions
- current deployment path
- required preview/testing behaviors
- current background jobs / workers
- current authentication assumptions

## Phase 2 — Establish New Source-of-Truth Workflow

- confirm GitHub as canonical code source
- prepare branch/worktree workflow
- verify Claude Code repo access pattern
- define review/approval and deployment path

## Phase 3 — Build AWS + Supabase Foundation

Provision:

- AWS account resources
- EC2 instance A (Agent / Dev / Staging)
- EC2 instance B (Production)
- Supabase project / DB
- domain + DNS + SSL
- baseline process manager / reverse proxy setup

## Phase 4 — Migrate Staging First

- deploy current app to staging environment
- connect to staging DB/config
- verify browser preview for Kyle
- verify logs / observability / restart controls
- verify Claude Code and Langston can inspect directly

## Phase 5 — Collaboration Topology Upgrade

Design and implement a cleaner Claude Code participation model:

- persistent cloud-side session/workspace goal
- cleaner notification/participation path
- less dependence on manual inbox polling
- clearer shared-context workflow

## Phase 6 — Run Parallel Period

- keep Replit available as fallback while staging proves itself
- compare deploy/debug efficiency
- identify missing operational capabilities
- validate Kyle’s comfort with the new preview/testing flow

## Phase 7 — Production Migration

Only after staging is stable and comfortable:

- deploy production runtime to EC2 production instance
- connect production DB/config
- verify separation from staging/dev/agents
- move operational center away from Replit

## Phase 8 — Post-Migration Hardening

- tighten secrets/access
- add backup and monitoring policies
- refine governance process for non-Replit delivery
- define rollback procedures
- define future multi-user/auth roadmap

---

# 15. Cost Expectations (Rough Order-of-Magnitude)

These are not exact quotes; they are planning bands.

## Likely Initial Stack

### AWS
Two modest EC2 instances could roughly land around:

- **~$20–$80/month each** depending on sizing and storage

Rough compute expectation:

- **~$40–$160/month** to start at modest scale

### Supabase
Depending on usage tier:

- approximately **~$25–$100+/month**

### Domain / DNS / SSL
- domain registration: modest annual cost
- SSL: often free
- Cloudflare basic tier can be low cost / free initially

## Practical Starting Range

A realistic rough starting band is likely:

- **~$75–$250/month** for a cleaner early-stage setup

This can rise with:

- larger instances
- storage growth
- monitoring
- worker processes
- heavier ML/inference needs

---

# 16. Tradeoffs

## Benefits of Migration

- better debugging
- direct shell/log access
- cleaner observability
- less UI automation fragility
- better environment separation
- stronger path to multi-user production architecture
- less dependence on Replit’s workflow quirks
- better long-term foundation for ML/AI additions

## Costs / Risks of Migration

- setup effort
- temporary slowdown during transition
- infra decisions now matter more
- governance process will need adaptation
- Claude Code collaboration model must be redesigned thoughtfully

---

# 17. Open Questions for Review

These are the main questions Claude Code should pressure-test:

1. What hidden Replit-specific assumptions exist in the app runtime?
2. What is the cleanest future-state collaboration model for Claude Code?
3. Which parts of the current governance process should be preserved vs redesigned?
4. Should Supabase be DB-only initially, or should auth be adopted from the start?
5. What is the best dev/staging separation model on the Agent/Dev/Staging EC2 instance?
6. What is the safest path for secrets and exchange credential handling?
7. What is the cleanest rollout path for future multi-user support?
8. What AWS sizing makes sense for the current state of DawnTrader?
9. What pieces should remain on the current Hetzner/OpenClaw infrastructure vs move to AWS?
10. What is the best way to make Claude Code more reachable/persistent without degrading Kyle’s preferred user experience?

---

# 18. Bottom-Line Recommendation

## Recommendation Summary

Proceed with a staged migration away from Replit.

Target-state recommendation:

- **GitHub** = code source of truth
- **AWS EC2 Instance A** = Langston/OpenClaw + Claude Code future cloud-side workspace + dev/staging
- **AWS EC2 Instance B** = production app
- **Supabase** = managed PostgreSQL database
- **Cloudflare/domain** = DNS + staging/production URLs
- **Google Drive** = governance/report/archive/backup support
- **Kyle keeps Claude Desktop / Claude Max** as his preferred human-facing interface

## Immediate Next Step

Have Claude Code review this document, challenge it, identify risks, and propose refinements before any infrastructure is provisioned.

---

# 19. Suggested Follow-On Deliverables

After review, the next documents should likely be:

1. **CURRENT_STATE_AUDIT.md**
2. **TARGET_ENVIRONMENT_LAYOUT.md**
3. **MIGRATION_CHECKLIST.md**
4. **COLLABORATION_TOPOLOGY_PLAN.md**
5. **SECRETS_AND_ACCESS_MODEL.md**
6. **STAGING_DEPLOYMENT_PLAN.md**
7. **PRODUCTION_CUTOVER_PLAN.md**

---

# End of Document
