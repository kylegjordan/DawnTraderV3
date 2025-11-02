import { test, expect } from "@playwright/test";

test("Phase 41F-L Three-Trade Paper Simulation", async ({ page }) => {
  console.log("[41F-L] Starting three-trade paper-mode simulation test");
  
  // Launch the application
  await page.goto("http://localhost:5000");
  await page.waitForTimeout(2000);

  // Login as testuser123
  console.log("[41F-L] Attempting login...");
  await page.fill('input[data-testid="input-username"]', "testuser123");
  await page.fill('input[data-testid="input-password"]', "SecurePass123!");
  await page.click('button[data-testid="button-login"]');
  
  // Wait for dashboard to load
  await page.waitForTimeout(3000);
  console.log("[41F-L] Login successful");

  // Capture initial portfolio state
  const initialPortfolio = await page.evaluate(() => {
    return fetch("/api/portfolio/overview", {
      headers: { 
        "x-app-mode": "paper",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      }
    }).then(r => r.json());
  });
  console.log("[41F-L] Initial portfolio:", initialPortfolio);

  // Execute trades via API (more reliable than UI interactions)
  const token = await page.evaluate(() => localStorage.getItem("token"));
  
  console.log("[41F-L] Executing Trade 1: Buy 0.01 BTC/USD");
  const trade1 = await page.evaluate(async (authToken) => {
    return fetch("/api/paper/trade/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "x-app-mode": "paper"
      },
      body: JSON.stringify({
        symbol: "BTC/USD",
        action: "buy",
        amount: 0.01
      })
    }).then(r => r.json());
  }, token);
  console.log("[41F-L] Trade 1 result:", trade1);
  await page.waitForTimeout(3000);

  console.log("[41F-L] Executing Trade 2: Buy 0.05 ETH/USD");
  const trade2 = await page.evaluate(async (authToken) => {
    return fetch("/api/paper/trade/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "x-app-mode": "paper"
      },
      body: JSON.stringify({
        symbol: "ETH/USD",
        action: "buy",
        amount: 0.05
      })
    }).then(r => r.json());
  }, token);
  console.log("[41F-L] Trade 2 result:", trade2);
  await page.waitForTimeout(3000);

  console.log("[41F-L] Executing Trade 3: Sell 0.01 BTC/USD");
  const trade3 = await page.evaluate(async (authToken) => {
    return fetch("/api/paper/trade/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "x-app-mode": "paper"
      },
      body: JSON.stringify({
        symbol: "BTC/USD",
        action: "sell",
        amount: 0.01
      })
    }).then(r => r.json());
  }, token);
  console.log("[41F-L] Trade 3 result:", trade3);
  await page.waitForTimeout(3000);

  // Capture final portfolio state
  const finalPortfolio = await page.evaluate(() => {
    return fetch("/api/portfolio/overview", {
      headers: { 
        "x-app-mode": "paper",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      }
    }).then(r => r.json());
  });
  console.log("[41F-L] Final portfolio:", finalPortfolio);

  // Get trade history
  const tradeHistory = await page.evaluate(() => {
    return fetch("/api/trades?limit=10", {
      headers: { 
        "x-app-mode": "paper",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      }
    }).then(r => r.json());
  });
  console.log("[41F-L] Trade History:", tradeHistory);

  // Check system health
  const systemHealth = await page.evaluate(() => {
    return fetch("/api/system/health", {
      headers: { 
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      }
    }).then(r => r.json());
  });
  console.log("[41F-L] System Health:", systemHealth);

  // Take final screenshot
  await page.screenshot({ 
    path: "diagnostic-reports/phase-41F-L-final.png", 
    fullPage: true 
  });

  // Assertions
  expect(trade1.success).toBe(true);
  expect(trade2.success).toBe(true);
  expect(trade3.success).toBe(true);
  expect(tradeHistory.length).toBeGreaterThanOrEqual(2); // At least 2 open trades
  expect(finalPortfolio.totalValue).toBeDefined();
  
  console.log("[41F-L] ✅ All tests passed");
});
