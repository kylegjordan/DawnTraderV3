// Add after the diagnostics endpoints
  
  // Trigger On-Demand Optimization Analysis
  app.post('/api/optimization/analyze', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { optimizationAnalyzer } = await import('./optimization/analyzer.js');
      await optimizationAnalyzer.runOptimizationAnalysis();
      res.json({ ok: true, message: 'Optimization analysis completed' });
    } catch (error: any) {
      console.error('Optimization analysis error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Optimization Proposals
  app.get('/api/optimization/proposals', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const proposals = await storage.getOrchestratorLogsByCategory(null, 'optimization', 20);
      res.json({ ok: true, proposals });
    } catch (error: any) {
      console.error('Get optimization proposals error:', error);
      res.status(500).json({ error: error.message });
    }
  });
