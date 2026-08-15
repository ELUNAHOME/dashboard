#!/bin/bash
# Zet de Google Ads-credentials als env vars in het Vercel-project `dashboard`.
#
# WAAROM DIT EEN SCRIPT IS EN GEEN AGENT-ACTIE (15 aug 2026):
# Claude voert principieel geen API-tokens in, ook niet op verzoek. Dit script leest de
# waarden rechtstreeks uit jouw eigen google-ads/.env en geeft ze aan de Vercel CLI door;
# ze komen dus nooit in een chat, een log of een transcript terecht. Jij draait het, jij
# blijft eigenaar van de secrets.
#
# WAT HET OPLOST: /api/data geeft nu `gspend: null` ("Google API niet geconfigureerd"),
# waardoor het dashboard terugvalt op een handmatig bijgewerkt bestand. Na dit script haalt
# de API de Google-spend zelf live op en is die fallback dood hout.
#
# Draaien:  bash "scripts/zet-google-env-vercel.sh"

set -uo pipefail

# Volledig PATH expliciet: node staat via nvm buiten het standaard PATH, en een script dat
# je als kant-en-klaar commando oplevert hoort niet te leunen op de shell van de bouwer.
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_BESTAND="$HOME/Documents/Claude/Projects/ELÛNA/google-ads/.env"
LOG="$HIER/zet-google-env-vercel.log"
TEAM="team_XCUSL4fQFVkYvHJE7BpODkiM"     # elunahome's projects
PROJECT="dashboard"

echo "== Google env vars naar Vercel, $(date '+%Y-%m-%d %H:%M') ==" | tee "$LOG"

# ── stap 1: gereedschap ────────────────────────────────────────────────────────
if ! command -v node >/dev/null; then
  echo "STOP: node niet gevonden. Verwacht op \$HOME/.nvm/versions/node/v24.18.0/bin" | tee -a "$LOG"
  exit 1
fi
echo "node:   $(node --version)" | tee -a "$LOG"

# ── stap 2: bronbestand ────────────────────────────────────────────────────────
if [ ! -f "$ENV_BESTAND" ]; then
  echo "STOP: $ENV_BESTAND niet gevonden, geen waarden om te zetten." | tee -a "$LOG"
  exit 1
fi
echo "bron:   $ENV_BESTAND gevonden" | tee -a "$LOG"

# ── stap 3: toegang tot het juiste team ────────────────────────────────────────
# Het dashboard staat onder 'elunahome's projects'. Gemeten 15 aug 2026: de CLI was
# ingelogd als kneauk-9494, en die ziet alleen team 'kneauk'. Dan faalt elke env-call
# met "The specified scope does not exist", en dat is een RECHTENprobleem, geen typefout.
echo "vercel: ingelogd als $(npx --yes vercel@latest whoami 2>&1 | tail -1)" | tee -a "$LOG"
if ! npx --yes vercel@latest teams ls 2>&1 | grep -q "elunahome"; then
  echo "" | tee -a "$LOG"
  echo "STOP: deze Vercel-login ziet het team 'elunahome's projects' NIET." | tee -a "$LOG"
  echo "      Log eerst in met het account dat daar toegang heeft:" | tee -a "$LOG"
  echo "        npx vercel login" | tee -a "$LOG"
  echo "      Draai dit script daarna opnieuw." | tee -a "$LOG"
  exit 2
fi
echo "team:   toegang tot elunahome's projects bevestigd" | tee -a "$LOG"

# ── stap 4: de vier waarden zetten ─────────────────────────────────────────────
# GOOGLE_ADS_LOGIN_CUSTOMER_ID wordt bewust NIET gezet: MCC 789-710-2801 beheert het
# operating-account 470-420-6454 niet, en met die header faalt elke call met
# USER_PERMISSION_DENIED. Leeg laten is hier de juiste waarde.
VARS="GOOGLE_ADS_CLIENT_ID GOOGLE_ADS_CLIENT_SECRET GOOGLE_ADS_REFRESH_TOKEN GOOGLE_ADS_DEVELOPER_TOKEN"
gezet=0
for VAR in $VARS; do
  WAARDE="$(grep -E "^${VAR}=" "$ENV_BESTAND" | head -1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r')"
  if [ -z "$WAARDE" ]; then
    echo "  OVERGESLAGEN $VAR: staat niet (of leeg) in .env" | tee -a "$LOG"
    continue
  fi
  # bestaande waarde eerst weg, anders weigert Vercel met "already exists"
  npx --yes vercel@latest env rm "$VAR" production --yes --scope "$TEAM" --project "$PROJECT" >/dev/null 2>&1
  if printf '%s' "$WAARDE" | npx --yes vercel@latest env add "$VAR" production \
       --scope "$TEAM" --project "$PROJECT" >>"$LOG" 2>&1; then
    echo "  OK  $VAR gezet (${#WAARDE} tekens)" | tee -a "$LOG"
    gezet=$((gezet+1))
  else
    echo "  FOUT $VAR niet gezet, zie $LOG" | tee -a "$LOG"
  fi
done

echo "" | tee -a "$LOG"
echo "$gezet van 4 variabelen gezet." | tee -a "$LOG"
if [ "$gezet" -lt 4 ]; then
  echo "Niet alles gelukt, dus NIET opnieuw deployen tot dit klopt." | tee -a "$LOG"
  exit 1
fi

# ── stap 5: opnieuw deployen en de UITKOMST bij de bron meten ──────────────────
# Env vars gelden pas na een nieuwe deploy. En "gezet" is geen bewijs: het bewijs is dat
# /api/data daarna 'live · Google Ads API' zegt in plaats van 'niet geconfigureerd'.
echo "Nieuwe deploy starten zodat de vars actief worden..." | tee -a "$LOG"
npx --yes vercel@latest deploy --prod --yes --scope "$TEAM" >>"$LOG" 2>&1 \
  && echo "  deploy gestart" | tee -a "$LOG" \
  || echo "  deploy niet gestart, push desnoods een lege commit naar GitHub" | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "Wacht circa een minuut en controleer dan:" | tee -a "$LOG"
echo "  curl -s https://dashboard.elunahome.nl/api/data | grep -o '\"google_note\":\"[^\"]*\"'" | tee -a "$LOG"
echo "Goed  = live · Google Ads API v21" | tee -a "$LOG"
echo "Fout  = Google API niet geconfigureerd" | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "Log: $LOG" | tee -a "$LOG"
