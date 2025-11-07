import { ConfigService } from "../services/config-service";

const initialConfigs = [
  {
    key: "ENABLE_LATTI",
    value: false,
    type: "boolean",
    description: "Enable LATTI autonomous learning and adaptation"
  },
  {
    key: "CLE_ENABLED",
    value: false,
    type: "boolean",
    description: "Enable Continuous Learning Engine"
  },
  {
    key: "REASONING_ENABLED",
    value: false,
    type: "boolean",
    description: "Enable autonomous reasoning capabilities"
  },
  {
    key: "ETHICS_CONSENSUS_ENABLED",
    value: false,
    type: "boolean",
    description: "Enable ethics consensus system"
  },
  {
    key: "MAX_POSITIONS",
    value: 5,
    type: "number",
    description: "Maximum concurrent positions allowed"
  },
  {
    key: "KILL_SWITCH_PCT",
    value: 10,
    type: "number",
    description: "Portfolio loss percentage that triggers kill switch"
  },
  {
    key: "MAX_RISK_PER_TRADE",
    value: 100,
    type: "number",
    description: "Maximum USD risk per trade"
  },
  {
    key: "OBSERVABILITY_ENABLED",
    value: true,
    type: "boolean",
    description: "Enable metrics collection and observability"
  },
  {
    key: "CACHE_ENABLED",
    value: true,
    type: "boolean",
    description: "Enable caching layer"
  },
  {
    key: "BOB_ENABLED",
    value: true,
    type: "boolean",
    description: "Enable BOB optimization layer"
  }
];

async function seedConfigs() {
  console.log('[Phase 6][Seed] Starting config registry seeding...');
  
  let created = 0;
  let updated = 0;
  
  for (const config of initialConfigs) {
    try {
      const existing = await ConfigService.get(config.key);
      
      await ConfigService.update(
        config.key,
        config.value,
        config.type,
        'system-seed'
      );
      
      if (existing) {
        updated++;
        console.log(`[Phase 6][Seed] Updated: ${config.key} = ${config.value}`);
      } else {
        created++;
        console.log(`[Phase 6][Seed] Created: ${config.key} = ${config.value}`);
      }
    } catch (error: any) {
      console.error(`[Phase 6][Seed] Failed to seed ${config.key}:`, error.message);
    }
  }
  
  console.log(`[Phase 6][Seed] ✅ Complete: ${created} created, ${updated} updated`);
  
  // Verify all configs were seeded
  const allConfigs = await ConfigService.getAll();
  console.log(`[Phase 6][Seed] Total configs in registry: ${allConfigs.length}`);
  
  process.exit(0);
}

seedConfigs().catch((error) => {
  console.error('[Phase 6][Seed] Fatal error:', error);
  process.exit(1);
});
