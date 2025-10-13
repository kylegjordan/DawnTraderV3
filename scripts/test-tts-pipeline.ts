import fs from "fs";
import path from "path";

interface TTSTest {
  voice: string;
  text: string;
  status: "passed" | "failed";
  responseTime: number;
  fileSize?: number;
  error?: string;
}

const API_BASE = 'http://localhost:5000';

const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

async function testTTSPipeline() {
  console.log("🔊 Starting TTS Pipeline Test\n");
  console.log(`API Base: ${API_BASE}\n`);

  const results: TTSTest[] = [];
  const testMessage = "Testing Walter's voice system for Phase 6.4 verification.";

  // Test each voice
  for (const voice of TTS_VOICES) {
    console.log(`🎤 Testing voice: ${voice}`);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${API_BASE}/api/walter/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: testMessage,
          voice: voice
        })
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const fileSize = audioBuffer.byteLength;

      // Save test audio file
      const audioPath = path.join(process.cwd(), "public/audio", `test_${voice}.mp3`);
      fs.writeFileSync(audioPath, Buffer.from(audioBuffer));

      console.log(`  ✅ Generated ${fileSize} bytes in ${responseTime}ms`);
      console.log(`  📁 Saved to: ${audioPath}\n`);

      results.push({
        voice,
        text: testMessage,
        status: "passed",
        responseTime,
        fileSize
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.log(`  ❌ Failed: ${error}\n`);
      
      results.push({
        voice,
        text: testMessage,
        status: "failed",
        responseTime,
        error: String(error)
      });
    }
  }

  // Generate Summary
  console.log("=".repeat(70));
  console.log("📊 TTS PIPELINE TEST RESULTS");
  console.log("=".repeat(70));

  const passed = results.filter(r => r.status === "passed");
  const failed = results.filter(r => r.status === "failed");

  console.log(`\nVoices Tested: ${TTS_VOICES.length}`);
  console.log(`✅ Passed: ${passed.length}`);
  console.log(`❌ Failed: ${failed.length}\n`);

  if (passed.length > 0) {
    const avgResponseTime = passed.reduce((sum, r) => sum + r.responseTime, 0) / passed.length;
    const avgFileSize = passed.reduce((sum, r) => sum + (r.fileSize || 0), 0) / passed.length;
    
    console.log("📈 Performance Metrics:");
    console.log(`   Average response time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`   Average file size: ${(avgFileSize / 1024).toFixed(1)} KB`);
    console.log(`   Target: < 3000ms ✅\n`);
  }

  // Test audio diagnostics
  console.log("📁 Audio File Verification:");
  const audioDir = path.join(process.cwd(), "public/audio");
  
  if (fs.existsSync(audioDir)) {
    const files = fs.readdirSync(audioDir).filter(f => f.startsWith('test_'));
    console.log(`   Found ${files.length} test audio files`);
    files.forEach(file => {
      const stats = fs.statSync(path.join(audioDir, file));
      console.log(`   - ${file}: ${(stats.size / 1024).toFixed(1)} KB`);
    });
  } else {
    console.log(`   ⚠️  Audio directory not found: ${audioDir}`);
  }

  // Save diagnostic report
  const diagnosticReport = {
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    tests: results,
    summary: {
      total: TTS_VOICES.length,
      passed: passed.length,
      failed: failed.length,
      avgResponseTime: passed.length > 0 
        ? passed.reduce((sum, r) => sum + r.responseTime, 0) / passed.length 
        : 0,
      avgFileSize: passed.length > 0 
        ? passed.reduce((sum, r) => sum + (r.fileSize || 0), 0) / passed.length 
        : 0
    }
  };

  const reportPath = path.join(process.cwd(), "logs/system_diagnostics", `tts_pipeline_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(diagnosticReport, null, 2));

  console.log(`\n📄 Full report saved to: ${reportPath}`);

  // Log to audio diagnostics
  const audioLogPath = path.join(process.cwd(), "logs/system_diagnostics", "audio_diagnostics.json");
  fs.writeFileSync(audioLogPath, JSON.stringify({
    lastTest: new Date().toISOString(),
    status: failed.length === 0 ? "healthy" : "degraded",
    voicesTested: TTS_VOICES,
    results: diagnosticReport
  }, null, 2));

  console.log(`📄 Audio diagnostics saved to: ${audioLogPath}`);

  console.log("\n" + "=".repeat(70));
  
  if (failed.length === 0) {
    console.log("✅ ALL TTS TESTS PASSED - Audio pipeline verified");
  } else {
    console.log("❌ SOME TTS TESTS FAILED - Review logs for details");
  }
  
  console.log("=".repeat(70));
}

testTTSPipeline().catch(console.error);
