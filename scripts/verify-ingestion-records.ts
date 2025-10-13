import fs from "fs";
import path from "path";
import { getMemoryStats } from "../server/services/walter-memory";

interface IngestionEntry {
  filename: string;
  fileType: string;
  startTime: string;
  endTime: string;
  success: boolean;
  memoriesCreated: number;
  metadata?: {
    fileSize?: number;
    userId?: string;
    error?: string;
  };
}

interface IngestionLog {
  ingestions: IngestionEntry[];
}

async function verifyIngestionRecords() {
  console.log("📋 Verifying Learning Ingestion Records\n");

  // Read ingest log
  const logPath = path.join(process.cwd(), "logs/ingest_log.json");
  
  if (!fs.existsSync(logPath)) {
    console.log("❌ No ingest log found at:", logPath);
    return;
  }

  const logData: IngestionLog = JSON.parse(fs.readFileSync(logPath, "utf-8"));
  const ingestions = logData.ingestions || [];

  console.log(`📊 Total ingestion entries: ${ingestions.length}\n`);

  // Analyze ingestions
  const successful = ingestions.filter(i => i.success);
  const failed = ingestions.filter(i => !i.success);
  
  const byFileType = ingestions.reduce((acc, ing) => {
    acc[ing.fileType] = (acc[ing.fileType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalMemoriesCreated = ingestions.reduce((sum, ing) => sum + (ing.memoriesCreated || 0), 0);

  // Check for complete status
  const completed = ingestions.filter(i => 
    i.success && 
    i.endTime && 
    new Date(i.endTime) > new Date(i.startTime)
  );

  console.log("✅ Ingestion Summary:");
  console.log(`   Total files processed: ${ingestions.length}`);
  console.log(`   Successful: ${successful.length}`);
  console.log(`   Failed: ${failed.length}`);
  console.log(`   Completed: ${completed.length}\n`);

  console.log("📂 Files by Type:");
  Object.entries(byFileType).forEach(([type, count]) => {
    console.log(`   ${type}: ${count} files`);
  });

  console.log(`\n💾 Total memories created from ingestion: ${totalMemoriesCreated}\n`);

  // Check for specific training directory files
  const trainingDir = path.join(process.cwd(), "docs/training/Walter_Learning_Files");
  
  if (fs.existsSync(trainingDir)) {
    const trainingFiles = fs.readdirSync(trainingDir)
      .filter(f => f.endsWith('.json') || f.endsWith('.txt') || f.endsWith('.md'));
    
    console.log(`📁 Training directory analysis:`);
    console.log(`   Path: ${trainingDir}`);
    console.log(`   Total supported files found: ${trainingFiles.length}\n`);

    // Check which files have been ingested
    const ingestedFilenames = new Set(ingestions.map(i => i.filename));
    const processedTrainingFiles = trainingFiles.filter(f => ingestedFilenames.has(f));
    const missingFiles = trainingFiles.filter(f => !ingestedFilenames.has(f));

    console.log(`   Files ingested: ${processedTrainingFiles.length}`);
    console.log(`   Files not in log: ${missingFiles.length}`);

    if (missingFiles.length > 0 && missingFiles.length <= 10) {
      console.log(`\n   Missing files:`);
      missingFiles.forEach(f => console.log(`     - ${f}`));
    } else if (missingFiles.length > 10) {
      console.log(`\n   First 10 missing files:`);
      missingFiles.slice(0, 10).forEach(f => console.log(`     - ${f}`));
      console.log(`     ... and ${missingFiles.length - 10} more`);
    }
  } else {
    console.log(`⚠️  Training directory not found: ${trainingDir}`);
  }

  // Get current memory stats
  console.log("\n🧠 Current Memory System Status:");
  let stats;
  try {
    // Use test user
    const userId = "6c591801-3072-431d-b192-30aaf426f15e";
    stats = await getMemoryStats(userId);
    
    console.log(`   Total retained memories: ${stats.totalMemories}`);
    console.log(`   Average importance: ${stats.avgImportance.toFixed(2)}/5`);
    console.log(`   Memory limit: 1500 (configured)\n`);

    if (stats.totalMemories === 1500) {
      console.log("   ✅ Memory system at capacity with smart aging active");
    } else if (stats.totalMemories < 1500) {
      console.log(`   📊 Memory system has ${1500 - stats.totalMemories} slots available`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not fetch memory stats: ${error}`);
  }

  // Check for errors
  const errors = ingestions.filter(i => i.metadata?.error);
  if (errors.length > 0) {
    console.log(`\n⚠️  Errors found: ${errors.length}`);
    errors.slice(0, 5).forEach(err => {
      console.log(`   - ${err.filename}: ${err.metadata?.error}`);
    });
  }

  // Status verification
  console.log("\n" + "=".repeat(70));
  console.log("📊 INGESTION VERIFICATION RESULTS");
  console.log("=".repeat(70));

  const allComplete = completed.length === ingestions.length;
  const noErrors = failed.length === 0;

  console.log(`✅ Status Checks:`);
  console.log(`   All entries completed: ${allComplete ? "✅" : "❌"} (${completed.length}/${ingestions.length})`);
  console.log(`   No failures: ${noErrors ? "✅" : "❌"} (${failed.length} failures)`);
  console.log(`   Memories created: ✅ ${totalMemoriesCreated} total`);

  // Save verification report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalEntries: ingestions.length,
      successful: successful.length,
      failed: failed.length,
      completed: completed.length,
      totalMemoriesCreated
    },
    fileTypes: byFileType,
    status: allComplete && noErrors ? "verified" : "issues_found",
    errors: errors.map(e => ({ filename: e.filename, error: e.metadata?.error }))
  };

  const reportPath = path.join(process.cwd(), "logs/system_diagnostics", `ingestion_verification_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📄 Verification report saved to: ${reportPath}`);

  console.log("\n" + "=".repeat(70));
  
  if (allComplete && noErrors) {
    console.log("✅ INGESTION VERIFICATION PASSED");
    console.log(`   All ${ingestions.length} files processed successfully`);
    console.log(`   ${totalMemoriesCreated} memories created from ingestion`);
    console.log(`   Current memory system: ${stats?.totalMemories || 'N/A'} memories retained`);
  } else {
    console.log("⚠️  INGESTION VERIFICATION INCOMPLETE");
    if (!allComplete) console.log(`   ${ingestions.length - completed.length} entries not marked complete`);
    if (!noErrors) console.log(`   ${failed.length} files failed to ingest`);
  }

  console.log("=".repeat(70));
}

verifyIngestionRecords().catch(console.error);
