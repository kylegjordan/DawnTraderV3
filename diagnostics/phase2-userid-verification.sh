#!/bin/bash

echo "🔍 Phase 2: User ID Verification & Schema Integrity Audit"
echo "=========================================================="
echo ""
echo "Scanning source code for userId/user_id references..."
echo "(Excluding auth-related files)"
echo ""

# Search in source directories, excluding auth files
rg -n "(userId|user_id)" server client shared \
  --ignore-case \
  --glob '!**/auth*' \
  --glob '!**/passport*' \
  --glob '!**/session*' \
  --glob '!**/*Auth*' \
  --glob '!**/middleware/auth.ts' \
  --glob '!**/routes/auth.ts' \
  2>/dev/null > diagnostics/userid_refs.txt || echo "No matches found in source"

echo "Source scan complete. Results: diagnostics/userid_refs.txt"
echo ""

# Search in compiled/build output if it exists
if [ -d "dist" ]; then
  echo "🔍 Searching compiled JS in dist/..."
  rg -n "(userId|user_id)" dist \
    --ignore-case \
    2>/dev/null >> diagnostics/userid_refs.txt || echo "No matches found in dist"
  echo "Dist scan complete."
else
  echo "ℹ️  No dist/ directory found (skipping compiled code scan)"
fi

echo ""
echo "📊 Results Summary:"
MATCH_COUNT=$(wc -l < diagnostics/userid_refs.txt 2>/dev/null || echo "0")
echo "   Total matches: $MATCH_COUNT lines"
echo ""

if [ "$MATCH_COUNT" -eq "0" ]; then
  echo "✅ SUCCESS: No non-auth userId references found!"
else
  echo "⚠️  WARNING: Found $MATCH_COUNT references to review"
  echo "   See: diagnostics/userid_refs.txt"
fi

echo ""
echo "=========================================================="
