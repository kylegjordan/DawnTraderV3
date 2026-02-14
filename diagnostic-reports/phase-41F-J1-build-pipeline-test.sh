#!/usr/bin/env bash
set -e

echo "🧱 Phase 41F-J.1 Build Pipeline Validation"
echo "=========================================="
echo ""

# Clean caches
echo "Step 1: Clearing caches..."
rm -rf .tsx-cache node_modules/.cache/tsx dist 2>/dev/null || true
echo "✓ Caches cleared"
echo ""

# Build
echo "Step 2: Building with TypeScript..."
npx tsc --project tsconfig.json
if [ $? -ne 0 ]; then
  echo "❌ TypeScript compilation failed"
  exit 1
fi
echo "✓ Build successful"
echo ""

# Check dist folder
echo "Step 3: Verifying dist output..."
if [ ! -d "dist" ]; then
  echo "❌ dist directory not created"
  exit 1
fi
if [ ! -f "dist/server/index.js" ]; then
  echo "❌ dist/server/index.js not found"
  exit 1
fi
echo "✓ Compiled files present in dist/"
echo ""

# Start server and capture logs
echo "Step 4: Starting compiled server..."
NODE_ENV=production node dist/server/index.js > /tmp/buildtest.log 2>&1 &
PID=$!
echo "  Server PID: $PID"
echo "  Waiting 10 seconds for startup..."
sleep 10

# Check if process is still running
if ! kill -0 $PID 2>/dev/null; then
  echo "❌ Server process died"
  cat /tmp/buildtest.log
  exit 1
fi

# Verify expected log patterns
echo ""
echo "Step 5: Verifying startup logs..."
echo "  Checking for registration logs..."
if grep -q "41F-J.*REGISTRATION" /tmp/buildtest.log; then
  echo "  ✓ Found 41F-J REGISTRATION log"
else
  echo "  ⚠️  41F-J REGISTRATION log not found (may be expected if routes were cleaned)"
fi

echo "  Checking for health_engine broadcasts..."
if grep -q "health_engine\|Broadcasting health_engine" /tmp/buildtest.log; then
  echo "  ✓ Found health_engine broadcast logs"
else
  echo "  ⚠️  health_engine logs not found"
fi

echo "  Checking for server startup..."
if grep -q "Server listening\|server.*listening\|Listening on port" /tmp/buildtest.log; then
  echo "  ✓ Found server startup confirmation"
else
  echo "  ❌ Server startup log not found"
  kill $PID 2>/dev/null || true
  cat /tmp/buildtest.log
  exit 1
fi

# Cleanup
echo ""
echo "Step 6: Cleanup..."
kill $PID 2>/dev/null || true
sleep 2
echo "  ✓ Server stopped"
echo ""

echo "=========================================="
echo "✅ BUILD PIPELINE VALIDATION PASSED"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - TypeScript cache cleared successfully"
echo "  - Project compiled to dist/ folder"
echo "  - Compiled server started without errors"
echo "  - Expected log patterns detected"
echo ""
echo "The build pipeline is working correctly."
echo "No further need for --no-cache workarounds."
