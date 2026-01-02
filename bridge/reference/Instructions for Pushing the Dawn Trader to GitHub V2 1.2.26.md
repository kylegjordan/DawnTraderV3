# Improved Safe Push Script
git checkout dawntrader-v3
git remote -v
git rm --cached -r backups/ diagnostic-reports/ docs/backups/ 2>/dev/null
find . -type f -size +100M -not -path "./.git/*" -print -exec git rm --cached {} \;
git add client server shared package.json package-lock.json README.md .gitignore
git commit -m "Your message here"
git push -u origin dawntrader-v3