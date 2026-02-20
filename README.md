# Galactic Marines Dashboard v2 (Trello Board)

**Features**
- Alle Ränge = Trello-Listen (Spalten)
- Fortbildungen & Medaillen/Orden = Trello-Checklisten (getrennt)
- Umschalten: Fortbildungen <-> Medaillen
- Statusfarben: ✅ grün, ⬜ grau
- Akzentfarbe: `#441826`
- "Login" per Code (einfach): Editor/Adjutant kann Items abhaken; Adjutant kann zusätzlich befördern (Liste ändern)
- Log Historie: aus Trello Board Actions (Beförderungen + Checklisten-Änderungen)

## Setup (lokal)
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Deployment (Vercel)
- Repo importieren
- Env Vars setzen (Production/Preview/Development)
- Deploy

## Env Vars (wichtig)
- `TRELLO_KEY`
- `TRELLO_TOKEN`  (Token muss `read` + für Updates `write` Scope haben)
- `TRELLO_BOARD_ID`  (Short-ID aus URL `/b/XXXXXXX/`)
- optional: `TRELLO_ADJUTANT_LIST_ID`
- optional Codes:
  - `GM_EDITOR_CODE`
  - `GM_ADJUTANT_CODE`

### Token erzeugen (manuell)
Ersetze `DEIN_API_KEY`:
```
https://trello.com/1/authorize?expiration=never&name=GalacticMarinesDashboard&scope=read,write&response_type=token&key=DEIN_API_KEY
```

## Text ändern
Am schnellsten:
- in `app/page.tsx` die Texte im Header ändern.

Optional per Vercel Env (nur wenn du es in Code nutzt):
- Setze `NEXT_PUBLIC_GM_HEADER_SUBTITLE`
- Setze `NEXT_PUBLIC_GM_INFO_TEXT`

> Hinweis: Next.js zeigt nur Variablen mit `NEXT_PUBLIC_` im Browser an.

## Checklist-Zuordnung
- Checklisten, deren Name `fort`/`ausbild`/`training` enthält → **Fortbildungen**
- Checklisten, deren Name `med`/`orden`/`award` enthält → **Medaillen/Orden**
Andere Checklisten werden ignoriert.
