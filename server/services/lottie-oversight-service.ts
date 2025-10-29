import { db } from "../db";
import { lottieOversightLog } from "../../shared/schema";

export class LottieOversightService {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly username = "testuser123";
  private readonly password = "SecurePass123!";

  async start() {
    console.log("[30.FX.4][LottieOversight] Service initialized ✅");
    
    await this.checkDHMAHealth();
    
    this.checkInterval = setInterval(() => {
      this.checkDHMAHealth().catch(err => {
        console.error("[LottieOversight] Error in scheduled check:", err.message);
      });
    }, this.INTERVAL_MS);
    
    console.log(`[LottieOversight] Scheduled checks every ${this.INTERVAL_MS / 60000} minutes`);
  }

  async stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log("[LottieOversight] Service stopped");
    }
  }

  private async checkDHMAHealth() {
    try {
      const axios = (await import("axios")).default;
      const token = await this.getAuthToken();
      
      const res = await axios.get("http://localhost:5000/api/strategy/dhma/telemetry?mode=live", {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });

      const { hitRate, avgToxicity, avgSpreadTicks, entries } = res.data;
      
      const healthy = 
        hitRate >= 0.45 && 
        avgToxicity <= 0.75 && 
        avgSpreadTicks <= 6 && 
        entries >= 5;
      
      const status = healthy ? "active" : "suspended";
      const reason = healthy 
        ? "ok" 
        : `metrics_out_of_bounds (hitRate=${hitRate?.toFixed(2)}, toxicity=${avgToxicity?.toFixed(2)}, spread=${avgSpreadTicks?.toFixed(1)}, entries=${entries})`;

      await db.insert(lottieOversightLog).values({
        event: "lottie_oversight",
        strategy: "dhma",
        status,
        reason,
        metadata: {
          hitRate,
          avgToxicity,
          avgSpreadTicks,
          entries,
          timestamp: new Date().toISOString(),
        },
      });

      const statusEmoji = healthy ? "✅" : "⚠️";
      console.log(`[LottieOversight] DHMA ${status.toUpperCase()} ${statusEmoji}`);
      console.log(`[LottieOversight] Metrics: hitRate=${hitRate?.toFixed(2)}, toxicity=${avgToxicity?.toFixed(2)}, spread=${avgSpreadTicks?.toFixed(1)}, entries=${entries}`);
    } catch (err: any) {
      console.error("[LottieOversight] Error checking DHMA health:", err.message);
      
      await db.insert(lottieOversightLog).values({
        event: "lottie_oversight",
        strategy: "dhma",
        status: "error",
        reason: `health_check_failed: ${err.message}`,
        metadata: {
          errorType: err.name,
          timestamp: new Date().toISOString(),
        },
      }).catch(dbErr => {
        console.error("[LottieOversight] Failed to log error:", dbErr.message);
      });
    }
  }

  private async getAuthToken(): Promise<string> {
    const axios = (await import("axios")).default;
    const response = await axios.post("http://localhost:5000/api/auth/login", {
      username: this.username,
      password: this.password,
    }, {
      timeout: 5000,
    });
    
    return response.data.accessToken;
  }
}

export const lottieOversightService = new LottieOversightService();
