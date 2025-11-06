#!/bin/bash
# Phase 3: Pre-commit hook to prevent large SQL/dump files
# Blocks commits of files >5MB or SQL dumps
#
# Installation:
#   cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

echo "🔍 Checking for large files and SQL dumps..."

# Find files larger than 5MB in staged commits
large_files=$(git diff --cached --name-only --diff-filter=ACM | \
  while read file; do
    if [ -f "$file" ]; then
      # Cross-platform file size check
      size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
      if [ "$size" -gt 5242880 ]; then  # 5MB in bytes
        # Format size for display
        size_mb=$((size / 1048576))
        echo "$file (${size_mb}MB)"
      fi
    fi
  done)

# Block SQL dumps and backup files
sql_dumps=$(git diff --cached --name-only --diff-filter=ACM | \
  grep -E '\.(sql\.gz|sql\.bz2|dump|backup|\.bak)$')

# Exit if violations found
if [ -n "$large_files" ] || [ -n "$sql_dumps" ]; then
  echo ""
  echo "❌ COMMIT BLOCKED - Large or prohibited files detected:"
  echo ""
  
  if [ -n "$large_files" ]; then
    echo "📦 Large files (>5MB):"
    echo "$large_files" | sed 's/^/  • /'
    echo ""
  fi
  
  if [ -n "$sql_dumps" ]; then
    echo "🗃️  SQL dumps/backups:"
    echo "$sql_dumps" | sed 's/^/  • /'
    echo ""
  fi
  
  echo "💡 Solutions:"
  echo "  1. Add files to .gitignore"
  echo "  2. Use Git LFS for large files: git lfs track \"*.sql.gz\""
  echo "  3. Remove from commit: git reset HEAD <file>"
  echo "  4. Store dumps externally (S3, database backups, etc.)"
  echo ""
  exit 1
fi

echo "✅ No large files or SQL dumps detected"
exit 0
