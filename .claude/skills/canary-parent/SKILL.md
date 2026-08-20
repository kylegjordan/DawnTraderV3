---
name: canary-parent
description: B-RULES-1d precondition canary (throwaway) - tests whether a parent skill's reference to a child skill RESOLVES. Delete after the canary discharges.
---

# CANARY PARENT

**PARENT MARKER: PARENT-K3M8-DAWNTRADER-1D**

This is a throwaway probe for B-RULES-1d §5(a). It exists to answer ONE question, which
§2(A) found is NOT a documented mechanism: **does referencing a child skill from a parent
actually pull the child's body in?**

## Step 1
Do nothing. This step exists only so the parent has a body.

## Step 2 — THE REFERENCE UNDER TEST
Now follow the **canary-child** skill.

**THE TEST:** if `CHILD-Z9Q4-DAWNTRADER-1D` appears in context from invoking THIS skill
alone, the parent→child reference resolves. If it does not, the reference is decorative and
every "parent workflow referencing per-step children" design in 1d must be rebuilt as
either one flat skill or N independently-invoked skills.
