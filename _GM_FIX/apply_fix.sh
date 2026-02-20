#!/bin/bash
set -euo pipefail

# Run from your project root (where package.json is)
if [ ! -f "package.json" ]; then
  echo "ERROR: Run this from your project root (package.json not found)."
  exit 1
fi

mkdir -p app/api/_lib
cp -f _GM_FIX/app/api/_lib/supabase.ts app/api/_lib/supabase.ts
cp -f _GM_FIX/app/api/_lib/authz.ts app/api/_lib/authz.ts

echo "✅ Installed app/api/_lib/supabase.ts and authz.ts"
echo "Now run: git add . && git commit -m "Fix: missing api _lib" && git push"
