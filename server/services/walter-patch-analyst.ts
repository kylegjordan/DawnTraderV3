/**
 * Walter Patch Analyst Service - Phase 5.9
 * 
 * Uses GPT-4o to analyze Bob's inspection reports and generate
 * detailed, actionable patch proposals with code-level fixes
 */

import OpenAI from 'openai';
import { 
  BobInspectionReport, 
  Finding, 
  PatchProposal 
} from '@shared/diagnostic-schema';
import { v4 as uuidv4 } from 'uuid';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class WalterPatchAnalyst {
  /**
   * Analyze Bob's inspection report and generate patch proposals
   */
  async analyzeAndPropose(report: BobInspectionReport, userId: string): Promise<PatchProposal[]> {
    console.log(`[Walter] 🧠 Analyzing inspection report with ${report.findings.length} findings`);

    const proposals: PatchProposal[] = [];

    // Process critical and high severity findings first
    const criticalFindings = report.findings
      .filter(f => f.severity === 'critical' || f.severity === 'high')
      .slice(0, 5); // Limit to top 5 critical issues

    for (const finding of criticalFindings) {
      try {
        const proposal = await this.generatePatchProposal(finding, report);
        proposals.push(proposal);
      } catch (error) {
        console.error(`[Walter] Failed to generate proposal for finding:`, error);
      }
    }

    console.log(`[Walter] ✅ Generated ${proposals.length} patch proposals`);
    return proposals;
  }

  /**
   * Generate a detailed patch proposal for a specific finding
   */
  private async generatePatchProposal(
    finding: Finding,
    report: BobInspectionReport
  ): Promise<PatchProposal> {
    
    const prompt = this.buildAnalysisPrompt(finding, report);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are Walter, an expert system maintenance AI for a cryptocurrency trading platform. 
Your purpose is to analyze diagnostic findings and provide clear, actionable code fixes that Kyle can copy-paste directly into Replit.

When providing fixes:
1. Be specific - include exact file paths, line numbers when available, and complete code snippets
2. Explain WHY the issue matters and HOW your fix addresses it
3. Consider system integrity, performance, and trading safety
4. Format fixes as ready-to-use code blocks
5. Flag if testing is required before applying

Remember: Every fix must maintain system stability and align with wealth-generation goals.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const aiAnalysis = response.choices[0].message.content || '';
      
      // Parse AI response into structured proposal
      const proposal = this.parseAIResponse(aiAnalysis, finding, report);

      console.log(`[Walter] 📋 Proposal generated for: ${finding.description}`);
      
      return proposal;

    } catch (error) {
      console.error('[Walter] OpenAI API error:', error);
      
      // Fallback: Create basic proposal without AI enhancement
      return {
        proposalId: uuidv4(),
        timestamp: new Date().toISOString(),
        sourceReport: 'bob-inspection',
        file: finding.location?.file || 'unknown',
        issue: finding.description,
        proposedFix: finding.suggestedAction || 'Manual investigation required - AI analysis unavailable',
        reason: `${finding.severity} severity ${finding.category} issue detected by Bob`,
        severity: finding.severity,
        estimatedImpact: this.estimateImpact(finding.severity),
        testingRequired: finding.severity === 'critical' || finding.severity === 'high',
        kyleApproved: false
      };
    }
  }

  /**
   * Build analysis prompt for GPT-4o
   */
  private buildAnalysisPrompt(finding: Finding, report: BobInspectionReport): string {
    const evidenceStr = finding.evidence 
      ? JSON.stringify(finding.evidence, null, 2)
      : 'No additional evidence';

    return `
DIAGNOSTIC FINDING ANALYSIS REQUEST

**Severity**: ${finding.severity.toUpperCase()}
**Category**: ${finding.category}
**Description**: ${finding.description}

**Location**:
${finding.location?.file ? `- File: ${finding.location.file}` : ''}
${finding.location?.line ? `- Line: ${finding.location.line}` : ''}
${finding.location?.function ? `- Function: ${finding.location.function}` : ''}
${finding.location?.table ? `- Table: ${finding.location.table}` : ''}
${finding.location?.column ? `- Column: ${finding.location.column}` : ''}

**Evidence**:
${evidenceStr}

**Bob's Suggested Action**: ${finding.suggestedAction || 'None provided'}

**Inspection Context**:
- Trigger: ${report.triggerType}
- Inspection Type: ${report.inspectionType}
${report.triggerSource ? `- Source: ${report.triggerSource}` : ''}

Please provide:
1. **Root Cause Analysis**: What caused this issue?
2. **Proposed Fix**: Exact code changes needed (with file paths and code blocks)
3. **Reasoning**: Why this fix resolves the issue
4. **Testing Requirements**: What should be tested after applying the fix
5. **Risk Assessment**: Any potential side effects or breaking changes

Format your response clearly for direct implementation in Replit.
`;
  }

  /**
   * Parse AI response into structured PatchProposal
   */
  private parseAIResponse(
    aiResponse: string,
    finding: Finding,
    report: BobInspectionReport
  ): PatchProposal {
    
    // Extract proposed fix section (everything between code blocks or specific sections)
    const fixMatch = aiResponse.match(/(?:Proposed Fix|Fix|Solution)[:\s]+([\s\S]*?)(?=\n\n[A-Z]|$)/i);
    const proposedFix = fixMatch ? fixMatch[1].trim() : aiResponse.substring(0, 500);

    // Extract reasoning
    const reasonMatch = aiResponse.match(/(?:Reasoning|Why|Explanation)[:\s]+([\s\S]*?)(?=\n\n[A-Z]|$)/i);
    const reason = reasonMatch 
      ? reasonMatch[1].trim().substring(0, 200)
      : `AI Analysis: ${finding.category} issue requiring attention`;

    // Determine testing requirement from AI response
    const testingRequired = 
      aiResponse.toLowerCase().includes('test') ||
      aiResponse.toLowerCase().includes('verify') ||
      finding.severity === 'critical' ||
      finding.severity === 'high';

    return {
      proposalId: uuidv4(),
      timestamp: new Date().toISOString(),
      sourceReport: 'bob-inspection',
      file: finding.location?.file || 'multiple files',
      issue: finding.description,
      proposedFix,
      reason,
      severity: finding.severity,
      estimatedImpact: this.estimateImpact(finding.severity),
      testingRequired,
      kyleApproved: false
    };
  }

  /**
   * Estimate change impact based on severity
   */
  private estimateImpact(severity: Finding['severity']): PatchProposal['estimatedImpact'] {
    switch (severity) {
      case 'critical':
        return 'breaking';
      case 'high':
        return 'major';
      case 'medium':
        return 'minor';
      default:
        return 'patch';
    }
  }

  /**
   * Generate summary of all proposals for transparency
   */
  generateProposalsSummary(proposals: PatchProposal[]): string {
    if (proposals.length === 0) {
      return 'No patch proposals generated';
    }

    const summary = proposals.map((p, i) => {
      return `
${i + 1}. [${p.severity.toUpperCase()}] ${p.issue}
   File: ${p.file}
   Fix: ${p.proposedFix.substring(0, 100)}${p.proposedFix.length > 100 ? '...' : ''}
   Impact: ${p.estimatedImpact}
   Testing Required: ${p.testingRequired ? 'Yes' : 'No'}
`;
    }).join('\n');

    return `Generated ${proposals.length} patch proposal(s):\n${summary}`;
  }
}

// Export singleton instance
export const walterPatchAnalyst = new WalterPatchAnalyst();
