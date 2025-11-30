# 0. Always use the correct branch
git checkout dawntrader-v3

# 1. Verify remote
git remote -v

# 2. Refresh .gitignore if needed
# (Only if you modified large files)
# cat > .gitignore ...

# 3. Remove accidentally staged large files
git rm --cached -r backups/ diagnostic-reports/ docs/backups/ 2>/dev/null

# 4. Stage ONLY the real code
git add client server shared package.json package-lock.json README.md .gitignore

# 5. Commit
git commit -m "Your message here"

# 6. Quick large file scan
git rev-list --objects --all | grep -E "sql|zip|tar.gz|backup|diagnostic" || echo "✔ No large files in history"

# 7. Push
git push -u origin dawntrader-v3
