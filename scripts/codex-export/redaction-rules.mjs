/**
 * CODEX EXPORT — REDACTION AND VERIFICATION RULES
 *
 * ⛔ TWO CLASSES, AND THE DISTINCTION IS THE DESIGN.
 *
 *   REDACT   — operational identifiers that are not secrets but are not the advisor's
 *              business either: host addresses, the database project ref, the shared
 *              test login, Kyle's email. These appear THROUGHOUT the governance corpus,
 *              which is exactly the material Kyle overruled us to include. Stripping
 *              the files would strip the history; masking the token keeps the prose
 *              readable and loses nothing an auditor needs.
 *
 *   HARD-FAIL — anything shaped like a LIVE CREDENTIAL. These are never masked. One hit
 *              aborts the export, deletes the staging directory, and names the file.
 *              ⭐ There is no "redact and continue" for this class ON PURPOSE: a live
 *              secret in the tree means the allowlist is wrong, and masking it would
 *              hide the fact that it is wrong.
 *
 * ⭐⭐ THE VERIFY PASS IS THE POINT, AND IT IS WHY THIS IS A MECHANISM RATHER THAN A HOPE.
 *     After redaction the exporter re-scans the OUTPUT for every REDACT pattern. A
 *     surviving hit means the redactor missed a spelling, and the export ABORTS.
 *     ⇒ the scan does not gate the CONTENT — it gates the REDACTOR. A new spelling of a
 *     known identifier cannot pass silently; it can only pass by someone adding it here.
 *
 * ⚠️ HONEST LIMIT, STATED RATHER THAN IMPLIED: this catches what it KNOWS. A brand-new
 *    secret of an unrecognised shape passes both classes. The allowlist is the primary
 *    defence and this is the backstop, never the other way round.
 */

/** Operational identifiers: masked in place, then verified absent. */
export const REDACT = [
  // ── hosts ──────────────────────────────────────────────────────────────────
  { name: 'staging-host-ip',      re: /\b188\.245\.193\.8\b/g,                 with: '[STAGING-HOST]' },
  { name: 'reviewer-host-ip',     re: /\b204\.168\.141\.77\b/g,                with: '[REVIEWER-HOST]' },
  // the sslip hostname embeds the IP, so it must be replaced BEFORE the bare-IP rule;
  // order in this array is the order applied.
  { name: 'staging-url',          re: /\b188\.245\.193\.8\.sslip\.io\b/g,      with: '[STAGING-URL]' },

  // ── data plane ─────────────────────────────────────────────────────────────
  { name: 'db-project-ref',       re: /\bvqqyisaudwenrdhnmjwt\b/gi,            with: '[DB-PROJECT]' },

  // ── the shared staging login (present in CLAUDE.md and elsewhere) ──────────
  { name: 'test-username',        re: /\btestuser123\b/g,                      with: '[TEST-USER]' },
  { name: 'test-password',        re: /SecurePass123!/g,                       with: '[TEST-PASS]' },

  // ── personal ───────────────────────────────────────────────────────────────
  { name: 'owner-email',          re: /\bkylegjordan@gmail\.com\b/gi,          with: '[OWNER-EMAIL]' },

  // ── shell shapes that carry an account name ────────────────────────────────
  { name: 'ssh-user-at-host',     re: /\b(?:root|deploy|langston)@\[?(?:STAGING-HOST|REVIEWER-HOST)\]?/g,
                                                                                with: '[SSH-TARGET]' },
];

/**
 * ⛔ Live-credential shapes. A single hit ABORTS the export. Never masked.
 * Ordered roughly by how unambiguous the shape is.
 */
export const HARD_FAIL = [
  { name: 'private-key-block',    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'github-token',         re: /\bgh[pousr]_[A-Za-z0-9]{16,}/ },
  { name: 'anthropic-key',        re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'openai-key',           re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/ },
  { name: 'slack-token',          re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'aws-access-key-id',    re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'discord-bot-token',    re: /\b[MNO][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/ },
  { name: 'jwt',                  re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  { name: 'supabase-service-key', re: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]?[A-Za-z0-9._-]{20,}/ },
  { name: 'postgres-url-with-pw', re: /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/ },
  // A password assignment with an actual value. Deliberately narrow: `password:` followed
  // by a type or a placeholder is ordinary code and must not trip this.
  { name: 'inline-password',      re: /\b(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*['"][^'"\s{}$]{8,}['"]/i },
];

/**
 * Files whose CONTENT is never scanned or redacted — binary or generated, where a
 * regex is meaningless and a false positive would abort the export for no reason.
 * ⚠️ These are still EXPORTED if the manifest admits them; this list only skips the
 *    text pass. Binary assets should be kept out by the MANIFEST, not by this.
 */
export const SKIP_TEXT_PASS = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|jar|woff2?|ttf|eot|mp4|mov|xlsx?|docx?)$/i;

/** Anything larger than this is not text-passed either — same reasoning. */
export const MAX_TEXT_BYTES = 8 * 1024 * 1024;

/**
 * ✅ VERIFIED PLACEHOLDERS — exact strings, each one READ AND CONFIRMED to be a
 * documentation placeholder or a test literal, not a credential. A HARD_FAIL hit whose
 * matched text is one of these is discounted.
 *
 * ⛔ THIS IS AN EXACT-STRING LIST ON PURPOSE, AND IT IS THE ONLY SAFE SHAPE FOR IT.
 *    The tempting fix when the scanner fires on `postgresql://test:test@localhost` is to
 *    loosen the PATTERN — which would then also discount a real connection string that
 *    happened to sit in a test file. An exact-string allowance discounts THAT string and
 *    nothing else, so the gate stays exactly as strong for everything it has not seen.
 *
 * ⚠️ Each entry carries where it was verified. Do not add one you have not opened.
 */
export const KNOWN_BENIGN = [
  'postgresql://user:pass@host:5432/db',                              // SYSTEM_MANUAL.md — doc placeholder
  'postgresql://test:test@localhost:5432/test',                       // vitest.config.ts + scope files — test fixture
  'postgresql://postgres:...@db.<project>.supabase.co:5432/postgres', // storage-client.ts — already elided at source
  "SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'",              // b-new-47 test — literal test value
  'postgresql://USER:PASS@db.<project>.supabase.co:5432/postgres',    // TEC_STALE_INVESTIGATION rev2 — doc placeholder
  // ⚠️ This one carries the REAL project ref in the host. It is benign as a CREDENTIAL —
  //    the password is the literal string `<PASSWORD>` — and the ref itself is handled
  //    separately by the `db-project-ref` REDACT rule, which masks it on the way out.
  //    ⛔ The credential scan runs on the ORIGINAL text BY DESIGN (a secret must never be
  //       masked into invisibility by an overlapping redaction), so it is listed here.
  'postgresql://postgres:<PASSWORD>@db.vqqyisaudwenrdhnmjwt.supabase.co:5432/postgres', // _archive/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md
];
