---
name: staging-browser-access
description: Use browser-scoped Chrome automation for DawnTrader staging UI checks on a Codex shift. Use for Step 7 page evidence, staging tab navigation, and PM handoffs; never use desktop-wide Computer Use for this work.
---

# DawnTrader staging browser access

Use the bundled Browser plugin with its **Chrome** backend. Read and follow the installed `control-in-app-browser` skill before the first browser action. Desktop-wide Computer Use, OS app discovery, `list_apps`, and accessibility-tree walks are not part of this workflow and remain disabled.

Kyle normally keeps the signed-in DawnTrader staging tab open in one of two long-lived Chrome windows. Discover Chrome through the Browser plugin, inspect the browser-scoped tab inventory across the connected Chrome windows, and select the tab whose title is **Dawn Trader** or whose URL begins `https://188.245.193.8.sslip.io/`. Do not identify the window from whichever tab happens to be active, and do not conclude staging is absent after inspecting only one window or one tab.

Reuse the selected Chrome and tab bindings for the current run. Navigate within that tab, read the rendered page, click or scroll as the verification requires, and capture screenshots when useful. For a Step 7 check, verify the affected page rather than the stale landing dashboard.

Do not ask Kyle to foreground the tab or provide screenshots while browser-scoped Chrome is connected and the signed-in tab is available. Ask Kyle only when the Chrome backend is unavailable after its documented troubleshooting, the staging tab is absent after the complete browser-scoped tab inventory, or the existing session has expired. Never type a password into a login form and never enable desktop Computer Use as a fallback.
