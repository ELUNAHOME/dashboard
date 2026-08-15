#!/bin/bash
# Zet de Google-credentials EEN VOOR EEN op je klembord, zodat je ze in de Vercel-webinterface
# kunt plakken zonder ze ergens te hoeven opzoeken of overtypen.
#
# WAAROM ZO: Claude voert zelf geen tokens in en toont ze ook niet in de chat. Dit script draait
# op jouw Mac, leest jouw eigen google-ads/.env en zet de waarde op jouw klembord. De waarde komt
# dus nergens anders terecht; jij plakt hem zelf in Vercel.
#
# Gebruik:  bash ~/Documents/Claude/Projects/EL*NA/EL*DASHBOARD/scripts/google-env-naar-klembord.sh
#
# Zet ondertussen deze pagina open:
#   https://vercel.com/elunahomes-projects/dashboard/settings/environment-variables

set -uo pipefail
export PATH="/usr/bin:/bin:/usr/sbin"

ENV_BESTAND="$HOME/Documents/Claude/Projects/ELÛNA/google-ads/.env"
[ -f "$ENV_BESTAND" ] || ENV_BESTAND="$(echo "$HOME"/Documents/Claude/Projects/EL*NA/google-ads/.env)"

if [ ! -f "$ENV_BESTAND" ]; then
  echo "STOP: google-ads/.env niet gevonden, niets om te kopieren."
  exit 1
fi

# GOOGLE_ADS_LOGIN_CUSTOMER_ID staat er bewust NIET bij: die moet LEEG blijven in Vercel.
# MCC 789-710-2801 beheert het operating-account 470-420-6454 niet, dus met die header
# faalt elke call met USER_PERMISSION_DENIED.
VARS="GOOGLE_ADS_CLIENT_ID GOOGLE_ADS_CLIENT_SECRET GOOGLE_ADS_REFRESH_TOKEN GOOGLE_ADS_DEVELOPER_TOKEN"

echo "Vier variabelen. Per stuk: waarde staat op je klembord, plak hem in Vercel, Enter voor de volgende."
echo "Environment in Vercel: vink Production aan (Preview en Development mogen ook)."
echo ""

n=0
for VAR in $VARS; do
  n=$((n+1))
  WAARDE="$(grep -E "^${VAR}=" "$ENV_BESTAND" | head -1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r')"
  if [ -z "$WAARDE" ]; then
    echo "[$n/4] $VAR  OVERGESLAGEN: staat niet in .env"
    continue
  fi
  printf '%s' "$WAARDE" | pbcopy
  # De waarde zelf tonen we NIET; alleen de lengte, zodat je kunt zien dat er iets staat
  # en of het plakken is aangekomen.
  echo "[$n/4] $VAR"
  echo "       staat nu op je klembord (${#WAARDE} tekens). Plak in Vercel onder deze naam."
  read -r -p "       Klaar? Enter voor de volgende... " _
done

# Klembord leegmaken, zodat er geen token blijft hangen na afloop.
printf '' | pbcopy
echo ""
echo "Klaar, en je klembord is weer leeg."
echo ""
echo "Vergeet in Vercel niet:"
echo "  - GOOGLE_ADS_LOGIN_CUSTOMER_ID NIET aanmaken (of leeg laten)"
echo "  - daarna Redeploy op de laatste production-deployment"
echo ""
echo "Terugmeten na de redeploy:"
echo "  curl -s https://dashboard.elunahome.nl/api/data | grep -o '\"google_note\":\"[^\"]*\"'"
echo "  goed = live · Google Ads API v21"
