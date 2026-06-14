#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ELÛNA — Google Ads handmatige update (30 seconden)
# Gebruik: bash scripts/update-google.sh
#
# Haal de waarden op via ads.google.com:
#   Account: ELÛNA · Klant-ID: 470-420-6454 · login: support@elunahome.nl
#   Navigeer: Campagnes > zet periode op "Deze maand" > lees Totaal: account
#   Kolommen: Kosten (= gspend), Conv.waarde/kosten (= groas)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

echo ""
echo "ELÛNA Google Ads update"
echo "══════════════════════════════"
echo ""
echo "Open ads.google.com > Campagnes > periode: Deze maand"
echo "Lees rij 'Totaal: account': Kosten en Conv.waarde/kosten"
echo ""

read -p "Google spend MTD (bijv. 503.64, Enter = overslaan): " G_SPEND_MTD
read -p "Google ROAS MTD conv.waarde/kosten (bijv. 1.42, Enter = overslaan): " G_GROAS_MTD
read -p "Google spend 30 dagen (Enter = overslaan): " G_SPEND_D30
read -p "Google ROAS 30 dagen (Enter = overslaan): " G_GROAS_D30
read -p "Google spend 7 dagen (Enter = overslaan): " G_SPEND_D7

echo ""
echo "Vercel env vars instellen..."
echo "(vereist: vercel CLI geïnstalleerd en ingelogd)"
echo ""

# Hulpfunctie: stel env var in als waarde niet leeg is
set_env() {
  local name="$1" val="$2"
  if [[ -n "$val" ]]; then
    echo "→ $name=$val"
    # Verwijder bestaande waarde eerst, dan toevoegen
    vercel env rm "$name" production --yes 2>/dev/null || true
    echo "$val" | vercel env add "$name" production
  fi
}

set_env "GOOGLE_SPEND_MTD"  "$G_SPEND_MTD"
set_env "GOOGLE_GROAS_MTD"  "$G_GROAS_MTD"
set_env "GOOGLE_SPEND_D30"  "$G_SPEND_D30"
set_env "GOOGLE_GROAS_D30"  "$G_GROAS_D30"
set_env "GOOGLE_SPEND_D7"   "$G_SPEND_D7"

echo ""
echo "Vercel herdeployment triggeren..."
vercel --prod --yes

echo ""
echo "Klaar. Dashboard bijgewerkt: https://dashboard.elunahome.nl"
echo ""

# Optioneel: ook data.json fallback bijwerken
TODAY=$(date +%Y-%m-%d)
echo "Tip: update ook data.json handmatig voor de statische fallback"
echo "     en voer 'git add data.json && git commit -m \"data refresh $TODAY\" && git push' uit"
