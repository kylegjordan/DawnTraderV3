import axios from 'axios';
import { logger } from '../utils/structured-logger';

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

interface ValidationResult {
  test: string;
  status: 'pass' | 'fail';
  message: string;
  duration?: number;
}

const results: ValidationResult[] = [];

async function validateMetricsEndpoint(): Promise<void> {
  const start = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/api/metrics`, {
      timeout: 5000,
    });

    const duration = Date.now() - start;

    if (response.status !== 200) {
      results.push({
        test: 'Metrics Endpoint - HTTP Status',
        status: 'fail',
        message: `Expected 200, got ${response.status}`,
        duration,
      });
      return;
    }

    if (duration > 200) {
      results.push({
        test: 'Metrics Endpoint - Response Time',
        status: 'fail',
        message: `Response time ${duration}ms exceeds 200ms threshold`,
        duration,
      });
    } else {
      results.push({
        test: 'Metrics Endpoint - Response Time',
        status: 'pass',
        message: `Response time ${duration}ms within threshold`,
        duration,
      });
    }

    const data = response.data;
    
    // Validate structure
    if (!data.system || !data.subsystems || !data.slo) {
      results.push({
        test: 'Metrics Endpoint - Data Structure',
        status: 'fail',
        message: 'Missing required fields: system, subsystems, or slo',
        duration,
      });
      return;
    }

    results.push({
      test: 'Metrics Endpoint - Data Structure',
      status: 'pass',
      message: 'All required fields present',
      duration,
    });

    // Validate SLOs exist
    if (!Array.isArray(data.slo) || data.slo.length === 0) {
      results.push({
        test: 'Metrics Endpoint - SLO Data',
        status: 'fail',
        message: 'No SLO data returned',
        duration,
      });
      return;
    }

    results.push({
      test: 'Metrics Endpoint - SLO Data',
      status: 'pass',
      message: `${data.slo.length} SLOs tracked`,
      duration,
    });

  } catch (error: any) {
    const duration = Date.now() - start;
    results.push({
      test: 'Metrics Endpoint',
      status: 'fail',
      message: error.message,
      duration,
    });
  }
}

async function validateSLOEndpoint(): Promise<void> {
  const start = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/api/metrics/slo`, {
      timeout: 5000,
    });

    const duration = Date.now() - start;

    if (response.status === 200) {
      results.push({
        test: 'SLO Endpoint',
        status: 'pass',
        message: 'Endpoint accessible',
        duration,
      });
    } else {
      results.push({
        test: 'SLO Endpoint',
        status: 'fail',
        message: `Expected 200, got ${response.status}`,
        duration,
      });
    }
  } catch (error: any) {
    const duration = Date.now() - start;
    results.push({
      test: 'SLO Endpoint',
      status: 'fail',
      message: error.message,
      duration,
    });
  }
}

async function validateHealthEndpoint(): Promise<void> {
  const start = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/api/health`, {
      timeout: 5000,
    });

    const duration = Date.now() - start;

    if (response.status === 200) {
      results.push({
        test: 'Health Endpoint',
        status: 'pass',
        message: 'Endpoint accessible',
        duration,
      });
    } else {
      results.push({
        test: 'Health Endpoint',
        status: 'fail',
        message: `Expected 200, got ${response.status}`,
        duration,
      });
    }
  } catch (error: any) {
    const duration = Date.now() - start;
    results.push({
      test: 'Health Endpoint',
      status: 'fail',
      message: error.message,
      duration,
    });
  }
}

async function runValidation(): Promise<void> {
  console.log('[Phase 5C Validation] Starting validation tests...\n');

  await validateHealthEndpoint();
  await validateMetricsEndpoint();
  await validateSLOEndpoint();

  console.log('\n[Phase 5C Validation] Results:\n');
  console.table(results);

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;

  console.log(`\n[Phase 5C Validation] Summary: ${passCount} passed, ${failCount} failed`);

  if (failCount > 0) {
    console.log('\n[Phase 5C Validation] ❌ Validation FAILED');
    process.exit(1);
  } else {
    console.log('\n[Phase 5C Validation] ✅ Validation PASSED');
    process.exit(0);
  }
}

runValidation().catch((error) => {
  console.error('[Phase 5C Validation] Fatal error:', error);
  process.exit(1);
});
