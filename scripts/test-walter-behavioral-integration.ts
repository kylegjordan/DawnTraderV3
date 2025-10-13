import { db } from "../server/db";
import { walterChats, walterChatLogs } from "../shared/schema";
import { generateWalterResponse } from "../server/services/walter-response";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

interface BehavioralTest {
  scenario: string;
  userMessage: string;
  expectedTone: string;
  expectedBehaviors: string[];
  status?: "passed" | "failed" | "partial";
  actualResponse?: string;
  toneAnalysis?: {
    detected: string[];
    expected: string[];
    matches: number;
  };
}

const BEHAVIORAL_TESTS: BehavioralTest[] = [
  {
    scenario: "Frustration - System Issue",
    userMessage: "This is ridiculous! The AI keeps failing and I've lost data. I'm so frustrated with this!",
    expectedTone: "empathetic, calm, solution-focused",
    expectedBehaviors: [
      "empathy",
      "acknowledgment",
      "solution",
      "calm"
    ]
  },
  {
    scenario: "Urgency - Time-Critical Task",
    userMessage: "I need this fixed NOW! The trading engine needs to be up immediately - we're losing money!",
    expectedTone: "responsive, action-oriented, brief",
    expectedBehaviors: [
      "urgent",
      "action",
      "concise",
      "immediate"
    ]
  },
  {
    scenario: "Curiosity - Learning Request",
    userMessage: "I'm curious about how the smart aging algorithm works. Can you explain the scoring system in detail?",
    expectedTone: "educational, detailed, encouraging",
    expectedBehaviors: [
      "explanation",
      "detail",
      "educational",
      "example"
    ]
  },
  {
    scenario: "Correction - Feedback Recognition",
    userMessage: "No, I didn't mean the live mode. I'm asking about paper mode settings specifically.",
    expectedTone: "acknowledging, adaptive, apologetic",
    expectedBehaviors: [
      "acknowledge",
      "sorry",
      "adapt",
      "correct"
    ]
  },
  {
    scenario: "Confusion - Unclear Request",
    userMessage: "The thing isn't working... you know, the stuff with the numbers and trading?",
    expectedTone: "clarifying, patient, helpful",
    expectedBehaviors: [
      "clarify",
      "question",
      "patient",
      "help"
    ]
  },
  {
    scenario: "Satisfaction - Positive Feedback",
    userMessage: "Wow, that worked perfectly! Thank you so much, Walter!",
    expectedTone: "warm, encouraging, humble",
    expectedBehaviors: [
      "glad",
      "encourage",
      "humble",
      "assist"
    ]
  }
];

function analyzeTone(response: string, expectedBehaviors: string[]): { detected: string[]; matches: number } {
  const detected: string[] = [];
  const responseLower = response.toLowerCase();
  
  const behaviorPatterns: Record<string, string[]> = {
    empathy: ['understand', 'sorry', 'frustrating', 'hear you'],
    acknowledgment: ['i see', 'understand', 'recognize', 'noted'],
    solution: ['help', 'fix', 'resolve', 'address', 'can'],
    calm: ['let', 'together', 'work', 'step'],
    urgent: ['immediately', 'right now', 'quick', 'asap'],
    action: ['do', 'will', 'can', 'let me'],
    concise: response.length < 200, // Short response
    immediate: ['now', 'immediately', 'right away'],
    explanation: ['how', 'works', 'algorithm', 'system'],
    detail: response.length > 150, // Detailed response
    educational: ['essentially', 'basically', 'example', 'means'],
    example: ['for example', 'such as', 'like', 'instance'],
    acknowledge: ['understand', 'i see', 'got it', 'right'],
    sorry: ['apologies', 'sorry', 'mistake', 'my fault'],
    adapt: ['paper mode', 'adjust', 'instead'],
    correct: ['corrected', 'mean', 'actually'],
    clarify: ['which', 'what', 'could you', 'help me understand'],
    question: ['?', 'asking', 'mean'],
    patient: ['happy to', 'let me', 'help'],
    help: ['help', 'assist', 'guide'],
    glad: ['glad', 'great', 'wonderful', 'excellent'],
    encourage: ['keep', 'continue', 'more', 'always'],
    humble: ['happy', 'here', 'anytime'],
    assist: ['help', 'assist', 'support', 'available']
  };

  expectedBehaviors.forEach(behavior => {
    const patterns = behaviorPatterns[behavior];
    if (!patterns) return;
    
    if (typeof patterns === 'boolean') {
      if (patterns) detected.push(behavior);
    } else {
      if (patterns.some(pattern => responseLower.includes(pattern))) {
        detected.push(behavior);
      }
    }
  });

  return { detected, matches: detected.length };
}

async function testWalterBehavioralIntegration() {
  console.log("🎭 Starting Walter Behavioral Integration Test\n");
  console.log("Testing real Walter responses across 6 emotional scenarios...\n");

  // Get test user
  const testUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.username, "testuser123")
  });

  if (!testUser) {
    console.error("❌ Test user not found");
    return;
  }

  const results: BehavioralTest[] = [];

  for (const test of BEHAVIORAL_TESTS) {
    console.log("─".repeat(70));
    console.log(`📋 Scenario: ${test.scenario}`);
    console.log(`💬 User: "${test.userMessage}"`);
    console.log(`🎯 Expected tone: ${test.expectedTone}\n`);

    try {
      // Create a test chat
      const [chat] = await db.insert(walterChats).values({
        userId: testUser.id,
        title: `Behavioral Test: ${test.scenario}`,
        status: "active"
      }).returning();

      // Send user message
      await db.insert(walterChatLogs).values({
        chatSessionId: chat.id,
        userId: testUser.id,
        role: "user",
        content: test.userMessage
      });

      // Call actual Walter AI service to get real response
      console.log(`   Calling Walter AI service...`);
      const walterResponse = await generateWalterResponse(testUser.id, chat.id, test.userMessage);
      console.log(`   Response received (${walterResponse.length} chars)`);

      // Analyze the response
      const toneAnalysis = analyzeTone(walterResponse, test.expectedBehaviors);
      const matchRate = toneAnalysis.matches / test.expectedBehaviors.length;
      
      const status = matchRate >= 0.75 ? "passed" : 
                     matchRate >= 0.5 ? "partial" : "failed";

      console.log(`🤖 Walter: "${walterResponse}"\n`);
      console.log(`📊 Tone Analysis:`);
      console.log(`   Expected behaviors: ${test.expectedBehaviors.join(', ')}`);
      console.log(`   Detected behaviors: ${toneAnalysis.detected.join(', ') || 'none'}`);
      console.log(`   Match rate: ${(matchRate * 100).toFixed(0)}%`);
      console.log(`   Status: ${status === "passed" ? "✅ PASSED" : status === "partial" ? "⚠️  PARTIAL" : "❌ FAILED"}\n`);

      results.push({
        ...test,
        status,
        actualResponse: walterResponse,
        toneAnalysis: {
          detected: toneAnalysis.detected,
          expected: test.expectedBehaviors,
          matches: toneAnalysis.matches
        }
      });

      // Cleanup - delete foreign key dependent records first
      const { eq } = await import("drizzle-orm");
      
      // Delete related records from other tables
      await db.execute(sql`DELETE FROM expert_response_logs WHERE chat_id = ${chat.id}`);
      await db.execute(sql`DELETE FROM walter_memory WHERE chat_id = ${chat.id}`);
      await db.delete(walterChatLogs).where(eq(walterChatLogs.chatSessionId, chat.id));
      await db.delete(walterChats).where(eq(walterChats.id, chat.id));

    } catch (error) {
      console.log(`❌ Test failed: ${error}\n`);
      results.push({
        ...test,
        status: "failed",
        actualResponse: `Error: ${error}`
      });
    }
  }

  // Generate Summary
  console.log("=".repeat(70));
  console.log("📊 BEHAVIORAL INTEGRATION TEST RESULTS");
  console.log("=".repeat(70));

  const passed = results.filter(r => r.status === "passed").length;
  const partial = results.filter(r => r.status === "partial").length;
  const failed = results.filter(r => r.status === "failed").length;

  console.log(`\nTotal scenarios tested: ${BEHAVIORAL_TESTS.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Partial: ${partial}`);
  console.log(`❌ Failed: ${failed}\n`);

  console.log("📋 Scenario Results:");
  results.forEach(r => {
    const icon = r.status === "passed" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
    const matchRate = r.toneAnalysis ? 
      `(${r.toneAnalysis.matches}/${r.toneAnalysis.expected.length} behaviors)` : '';
    console.log(`   ${icon} ${r.scenario}: ${r.status?.toUpperCase()} ${matchRate}`);
  });

  // Save diagnostic report
  const diagnosticReport = {
    timestamp: new Date().toISOString(),
    testType: "behavioral_integration",
    realResponses: true,
    scenarios: results,
    frameworkComponents: [
      "Intent Detection",
      "Behavioral Guidance",
      "Tone Adaptation",
      "Response Validation"
    ],
    summary: {
      total: BEHAVIORAL_TESTS.length,
      passed,
      partial,
      failed
    }
  };

  const reportPath = path.join(
    process.cwd(), 
    "logs/system_diagnostics", 
    `behavioral_integration_${Date.now()}.json`
  );
  
  fs.writeFileSync(reportPath, JSON.stringify(diagnosticReport, null, 2));
  console.log(`\n📄 Diagnostic report saved to: ${reportPath}`);

  const personalityLogPath = path.join(process.cwd(), "logs", "personality_diagnostics.json");
  fs.writeFileSync(personalityLogPath, JSON.stringify(diagnosticReport, null, 2));
  console.log(`📄 Personality diagnostics updated: ${personalityLogPath}`);

  console.log("\n" + "=".repeat(70));
  
  if (failed === 0) {
    console.log("✅ BEHAVIORAL INTEGRATION TEST PASSED");
    console.log(`   ${passed} scenarios passed with real Walter responses`);
    console.log(`   ${partial} scenarios partially matched`);
    console.log("   Tone detection and adaptation verified");
  } else {
    console.log("⚠️  BEHAVIORAL INTEGRATION TEST COMPLETED WITH ISSUES");
    console.log(`   ${passed} passed, ${partial} partial, ${failed} failed`);
  }
  
  console.log("=".repeat(70));

  return diagnosticReport;
}

testWalterBehavioralIntegration().catch(console.error);
