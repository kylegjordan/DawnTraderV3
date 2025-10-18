import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { learningCoordinator } from "../services/learning-coordinator";
import { modelConsistencyManager } from "../services/model-consistency-manager";
import { crossDomainReasoning } from "../services/cross-domain-reasoning";
import { clusterBus } from "../services/cluster-bus";
import { nanoid } from "nanoid";

const router = Router();

/**
 * Phase 18.0: Learning Network API Routes
 * 
 * Provides REST API for learning delta management, model consistency,
 * and cross-domain reasoning.
 */

// Get learning delta statistics
router.get("/delta-stats", authenticateToken, async (req, res) => {
  try {
    const stats = await learningCoordinator.getStatistics();
    res.json({ ok: true, stats });
  } catch (error) {
    console.error("[LearningAPI] Error fetching delta stats:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to fetch learning delta statistics" 
    });
  }
});

// Get recent learning deltas
router.get("/deltas", authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const deltas = await learningCoordinator.getRecentDeltas(limit);
    res.json({ ok: true, deltas });
  } catch (error) {
    console.error("[LearningAPI] Error fetching deltas:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to fetch learning deltas" 
    });
  }
});

// Get alignment statistics
router.get("/alignment-stats", authenticateToken, async (req, res) => {
  try {
    const stats = await modelConsistencyManager.getStatistics();
    res.json({ ok: true, stats });
  } catch (error) {
    console.error("[LearningAPI] Error fetching alignment stats:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to fetch alignment statistics" 
    });
  }
});

// Get recent model alignments
router.get("/alignments", authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const alignments = await modelConsistencyManager.getAlignmentHistory(limit);
    res.json({ ok: true, alignments });
  } catch (error) {
    console.error("[LearningAPI] Error fetching alignments:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to fetch alignment history" 
    });
  }
});

// Get cross-domain proposals
router.get("/proposals", authenticateToken, async (req, res) => {
  try {
    const targetDomain = req.query.targetDomain as string | undefined;
    const proposals = crossDomainReasoning.getPendingProposals(targetDomain);
    const stats = crossDomainReasoning.getStatistics();
    res.json({ ok: true, proposals, stats });
  } catch (error) {
    console.error("[LearningAPI] Error fetching proposals:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to fetch cross-domain proposals" 
    });
  }
});

// Trigger manual learning sync
router.post("/sync", authenticateToken, async (req, res) => {
  try {
    const traceId = nanoid();
    
    // Publish a test learning delta event
    await clusterBus.publish(
      "learning_delta",
      {
        deltaType: "discovery",
        data: {
          source: "manual_sync",
          timestamp: new Date().toISOString(),
          discovery: "Manual learning sync triggered via API",
        },
        traceId,
      },
      "api_trigger"
    );

    res.json({ 
      ok: true, 
      message: "Learning sync triggered successfully",
      traceId,
    });
  } catch (error) {
    console.error("[LearningAPI] Error triggering sync:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to trigger learning sync" 
    });
  }
});

// Approve a cross-domain proposal
router.post("/proposals/:proposalId/approve", authenticateToken, async (req, res) => {
  try {
    const { proposalId } = req.params;
    const success = await crossDomainReasoning.approveProposal(proposalId);
    
    if (success) {
      res.json({ 
        ok: true, 
        message: "Proposal approved successfully" 
      });
    } else {
      res.status(404).json({ 
        ok: false, 
        error: "Proposal not found" 
      });
    }
  } catch (error) {
    console.error("[LearningAPI] Error approving proposal:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to approve proposal" 
    });
  }
});

// Reject a cross-domain proposal
router.post("/proposals/:proposalId/reject", authenticateToken, async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { reason } = req.body;
    const success = await crossDomainReasoning.rejectProposal(proposalId, reason);
    
    if (success) {
      res.json({ 
        ok: true, 
        message: "Proposal rejected successfully" 
      });
    } else {
      res.status(404).json({ 
        ok: false, 
        error: "Proposal not found" 
      });
    }
  } catch (error) {
    console.error("[LearningAPI] Error rejecting proposal:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to reject proposal" 
    });
  }
});

export default router;
