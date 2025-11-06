#!/bin/bash
# Phase 2C: Source Code Scan for userId References
# Excludes: node_modules, .git, logs, backups

echo "=== Phase 2C Source Code Scan ==="
echo "Date: $(date)"
echo ""

echo "Scanning for userId references outside auth routes..."
grep -r "userId" server/ \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude="*.log" \
  --include="*.ts" \
  --include="*.js" \
  | grep -v "server/routes/auth" \
  | grep -v "// Phase 2C" \
  | wc -l

echo ""
echo "Top files with userId references:"
grep -r "userId" server/ \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude="*.log" \
  --include="*.ts" \
  --include="*.js" \
  | grep -v "server/routes/auth" \
  | cut -d: -f1 \
  | sort \
  | uniq -c \
  | sort -rn \
  | head -20

echo ""
echo "=== Scan Complete ==="
