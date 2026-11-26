# B-XSTOCK-BID-TRIGGER-RELAND #1191 — Nov 26 Discord repeat containment

change-class: architecture

Owner: ANALYST, existing #1191. INFRA owns any change to the dispatcher unit.
Review requested for a temporary dispatcher-only artifact. Serving base
`5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, protected PM2 restart 716.
This candidate does not authorize rollout, broad alert suppression, or changes
to the application. The durable #1191 incident path continues separately.

## Evidence and scope

The six-hour repeat policy from `960b41e41` re-sent 196 of the original 450
xStock VTS no-decision warnings by 21:03:11Z. Each had successful webhook
output and a matching ledger receipt. The other
confirmed repeat was an independent PDD no-price close
`41e29ee5-4843-4f34-a49b-4ab9014c660a`. §3k.6 of the Bid Trigger Reland
Progress Report has the full incident evidence, crypto controls and source.
The 450 recorded first deliveries preceded this hold. Of these, 83 became
eligible to repeat at 21:12:26Z. Draining a running dispatcher invocation is
ordinary service behavior and does not establish that containment works.
The two ordinary runs eventually sent 449 of 450 original repeats and one
original resolved. The next repeat eligibility is Nov 27 at 08:57:33Z for
366 IDs and 09:12:33Z for 83, subject to the following timer tick.

The permanent P3 plan groups future attempts only with positive incident
evidence. The original alerts lack that evidence and need a separate,
retrospective delivery decision. The manifest is the 450 original exact alert
IDs whose first successful Discord posts were verified, sorted with a final
newline. Its digest is
`37dc0d1d99c37a49a614f24a136434a04ad5263be80fe19e20ee0906e24f9816`.
The dispatcher reads it only if the deployment environment names it and the
bytes match exactly. It can defer only resurface of active warning/breakage
rows with the VTS no-decision key and an exact ID in the verified manifest.
That decision uses the fresh row after the resolved check, so acknowledgement
or resolution during an earlier send preserves ordinary handling.
First promotions, other IDs including new VTS warnings, unpriced closes,
acknowledgement, resolution, raw exposure and ordinary retry clocks retain
their current treatment. Deferred IDs neither post nor advance their delivery
clock. The built-in cutoff is Nov 27 15:15 UTC, after the scheduled joint
recovery read. A missing or altered manifest or the cutoff ends deferral.

## Serving boundary and rollback

The producer writes the alert ledger, the dispatcher advances state only for
ordinary promotion and successful delivery, and the existing engine/owner
routes still clear on their own evidence. This change only adds an optional
predicate to the resurface call. No operation in this hold writes, ACKs,
resolves or deletes a deferred row. The only staging schedule using this
entrypoint is `system-alerts-dispatcher.timer`, every 15 minutes. Its
`system-alerts-dispatcher.service` invokes the current CLI from
`/home/deploy/dawntrader` as deploy. The standard app build and staging tree
contain none of this candidate's changes. A currently running invocation must
finish naturally so an in-flight independent send is never interrupted.

Pending Coltrane and INFRA agreement on the exact install method, the proposed
path is a standalone bundle built from this serving-based candidate, invoked
only by the dispatcher unit with the verified manifest. Before taking effect,
verify the exact candidate CI, serving reference, deployed PM2 identity,
artifact checksum, initial/repeat/expiry controls, and that no conflicting
dispatcher change or staging window is active. Reading the first ordinary
dispatch after installation must show held exact IDs, durable alert records,
and a passed independent positive control. Healthy ordinary delivery and
PM2 identity are independent checks. Roll back by restoring the original
dispatcher invocation and removing the hold environment, via INFRA. The
cutoff is an additional limit, and the operator still removes the temporary
artifact and override. If no reviewed no-restart path is available, use the
normal approved deploy sequence. Do not stop the dispatcher, alter the
webhook, or apply an alert-state workaround to make a queue look cleared.

## Isolated dispatcher proof

Build with `npx esbuild scripts/system-alerts.ts --platform=node --bundle
--format=cjs --outfile=dist/nov26-system-alerts-containment.cjs`. Run the
bundle against an isolated ledger and local mock webhook, with the actual
digest-matched 450 IDs seeded as due repeats. All 450 of 450 were deferred,
and all 450 records were identical after dispatch. Four of four controls
each posted once: first warning, unrelated no-decision repeat, PDD unpriced
repeat and independent critical repeat. Separate one-ID fixtures for an
absent manifest, changed manifest and the exact cutoff all used normal
delivery, with the successful resurface recorded. The original resurface,
actor allowlist and governance evidence suites include a concurrency regression.
In a four-row bundled replay, the first send changed two later records. A
newly acknowledged warning delivered, a newly resolved warning was skipped,
and the remaining listed active warning was deferred with its row unchanged.
The preceding bundle deferred all three and failed the same regression.
