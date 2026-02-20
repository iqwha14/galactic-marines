#!/bin/bash
set -euo pipefail

# Run from your project root (where package.json is)
if [ ! -f "package.json" ]; then
  echo "ERROR: Run this from your project root (package.json not found)."
  exit 1
fi

echo "==> Installing root lib files..."
mkdir -p lib
cp -f _GM_FIX2/lib/supabase.ts lib/supabase.ts
cp -f _GM_FIX2/lib/authz.ts lib/authz.ts

echo "==> Patching imports in app/api/**/route.ts ..."
# Replace any depth of ../../..../_lib/supabase -> @/lib/supabase
# Replace any depth of ../../..../_lib/authz    -> @/lib/authz
# Also handle .ts extension or no extension.
perl -pi -e 's#from\s+["\x27](?:\.\./)+_lib/supabase(?:\.ts)?["\x27]#from "@/lib/supabase"#g' $(find app/api -name "route.ts" -type f)
perl -pi -e 's#from\s+["\x27](?:\.\./)+_lib/authz(?:\.ts)?["\x27]#from "@/lib/authz"#g' $(find app/api -name "route.ts" -type f)

echo "==> Done."
echo ""
echo "Now run:"
echo "  git add ."
echo "  git commit -m \"Fix imports to @/lib\""
echo "  git push"
echo ""
echo "If your build complains about '@/...' alias, ensure tsconfig.json contains:"
echo '  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./*"] } }'
