NO-COPYPASTE FIX (Vercel build error: can't resolve '../../../../_lib/supabase' / authz)

You have two options:

Option A (fastest):
1) Unzip this ZIP into your project root.
2) Run:
   chmod +x _GM_FIX/apply_fix.sh
   ./_GM_FIX/apply_fix.sh
3) Commit + push.

Option B (manual copy with Finder, still no copy/paste of code):
- Copy the folder: app/api/_lib from _GM_FIX into your project (merge/replace)

What this adds:
- app/api/_lib/supabase.ts
- app/api/_lib/authz.ts

That will satisfy imports like '../../../../_lib/supabase' used by your ops routes.
