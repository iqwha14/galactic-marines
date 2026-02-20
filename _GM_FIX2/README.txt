ROOT LIB SOLUTION (no more ../../../../ path hell)

WHAT THIS DOES
- Adds:
  - lib/supabase.ts
  - lib/authz.ts
- Automatically patches ALL app/api/**/route.ts imports:
  from "../../.../_lib/supabase" -> from "@/lib/supabase"
  from "../../.../_lib/authz"    -> from "@/lib/authz"

HOW TO USE (no copy/paste code)
1) Unzip into your project root (same folder as package.json)
2) Run:
   chmod +x _GM_FIX2/apply_fix.sh
   ./_GM_FIX2/apply_fix.sh
3) Commit + push

Vercel env vars needed:
- NEXTAUTH_SECRET
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
Optional:
- EDITOR_DISCORD_IDS
- UO_DISCORD_IDS
