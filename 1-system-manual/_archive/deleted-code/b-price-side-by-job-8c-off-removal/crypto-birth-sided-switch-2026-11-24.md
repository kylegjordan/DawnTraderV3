# Archived 8c dark-launch switch

`level_basis.crypto_birth_sided_enabled` let the bid/ask pricing change ship dark. OFF preserved existing stamps and stamped otherwise unstamped crypto births `mid` without rebasing. ON ran the sided rebase and its price-selection diagnostics. KD-91 turned it on. The registered week remains NO-RESULT with no stop trigger, and Coltrane discharged the hold at `34fec1121b8127fc987ab85c837cf31e366169e7`.

The pre-removal commit `40d06d3661da2690a58ea10e2a2e832555030d70` preserves all original bytes.

| Removed fragment | Original file |
| --- | --- |
| Reader, boolean knob field and switch-only warmup output | `server/core/trading/level-build-config.ts`, `server/startup/b72-warmup.ts` |
| OFF arm below the knob read, whose surviving ON arm is now unconditional | `server/services/signal-orchestrator.ts` |
| Switch-only reader, wiring and original seed assertions | `server/tests/unit/b8c-switch.test.ts` |

```ts
function readSidedSwitch(): boolean {
  const v = getCachedNumberRequired(LEVEL_BASIS_MODULE, 'crypto_birth_sided_enabled', CRYPTO_KEY);
  if (v !== 0 && v !== 1) throw new Error(`module_constants: ${LEVEL_BASIS_MODULE}.crypto_birth_sided_enabled must be 0 or 1, got ${v}`);
  return v === 1;
}
```

```ts
if (!_cbKnobs.sidedEnabled) {
  if (levelGeometryStampOf(rawSignal.metadata) === null) {
    rawSignal = { ...rawSignal, metadata: { ...(rawSignal.metadata ?? {}), levelGeometry: 'mid' } };
  }
}
```

Recover the exact old source from the cited commit. The supported operational rollback of Phase B uses the Phase A code and restores the switch row in its ON state. Restoring the historical code requires its own reviewed procedure and must never run while its required switch row is absent.
