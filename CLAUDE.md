# ELÛNA Dashboard — CLAUDE.md

## Wat is dit
Vercel serverless dashboard voor ELÛNA (Calm Beige waterkoker, €69,95).
Live op: https://dashboard.elunahome.nl (Vercel, repo: ELUNAHOME/dashboard)

De live data komt van `/api/data` (Vercel serverless). Als die faalt → fallback op `data.json`.
Nooit direct data in `index.html` aanpassen.

---

## Hoe werkt de data

| Bron | Hoe | Status |
|------|-----|--------|
| Shopify | Automatisch via Shopify API | Live |
| Meta Ads | Automatisch via Meta Graph API | Live |
| Klaviyo metrics | Automatisch via Klaviyo API | Live |
| Klaviyo flows & campagnes | Automatisch via flow/campaign-values-reports API | Live |
| Google Ads | Handmatig via `scripts/update-google.sh` | Handmatig |

---

## Google Ads bijwerken (30 seconden)

```bash
bash scripts/update-google.sh
```

Voert interactief in:
- Google spend MTD / 30d / 7d
- Google ROAS MTD / 30d

Vereist: `vercel` CLI geïnstalleerd en ingelogd (`vercel login`).

Handmatige waarden halen op via:
> ads.google.com > Campagnes > periode: "Deze maand" > rij "Totaal: account"
> Kolommen: Kosten + Conv.waarde/kosten (Klant-ID: 470-420-6454)

---

## Token check

Controleer META_ACCESS_TOKEN geldigheid:
```
https://dashboard.elunahome.nl/api/health
```

Geeft terug: is_valid, never_expires, days_left, waarschuwing als < 30 dagen.

Als de token bijna verloopt:
> Meta Business Manager > Systeemgebruikers > Token genereren > vervaldatum: Never

---

## data.json bijwerken (fallback)

`data.json` is de statische fallback. Bijwerken via dagelijkse MCP calls:

1. **Shopify** via `shopify_list_orders` — MTD, 7d, 30d orders
2. **Meta** via `ads_get_ad_entities` — account 924352226288770, campaign niveau
3. **Klaviyo** via `get_flow_report` + `get_campaign_report` MCP tools
   - Placed Order metric ID: `RP7a8m`
   - Timeframe: `last_30_days`
4. **Google** handmatig via ads.google.com

Push: `git add data.json && git commit -m "data refresh $(date +%Y-%m-%d)" && git push`

---

## Env vars (Vercel project settings)

| Var | Waarde |
|-----|--------|
| SHOPIFY_STORE | elunahome.myshopify.com |
| SHOPIFY_ACCESS_TOKEN | shpat_... |
| META_ACCESS_TOKEN | EAA... |
| META_AD_ACCOUNT | 924352226288770 |
| KLAVIYO_API_KEY | pk_... |
| GOOGLE_SPEND_MTD | handmatig (bijv. 503.64) |
| GOOGLE_GROAS_MTD | handmatig (bijv. 1.42) |
| GOOGLE_SPEND_D30 | handmatig |
| GOOGLE_GROAS_D30 | handmatig |
| GOOGLE_SPEND_D7 | handmatig (optioneel) |

---

## Berekeningen

```
blended_roas = rev / (meta_spend + google_spend)
cac_per_unit = (meta_spend + google_spend) / units
netto = brutomarge (€26,35) - cac_per_unit
break_even_roas = ~1.8×
```

Meta in-platform ROAS (`mroas`) is NIET betrouwbaar — altijd blended gebruiken.

---

## Vaste marge-model (nooit aanpassen tenzij prijzen veranderen)

| Post | Bedrag |
|------|--------|
| Verkoopprijs ex btw | €57,81 |
| COGS | €11,50 |
| Logistiek | €15,42 |
| Fees + retouren | €4,23 |
| **Brutomarge** | **€26,35** |
| Doel-CAC | €14,45 |
| Netto (doel) | €10,89 (19%) |

---

## Bestandsstructuur

```
ELÛNA DASHBOARD/
├── index.html               # Dashboard shell — CSS, HTML, JS logic
├── data.json                # Statische fallback — bijwerken bij grote data-wijzigingen
├── api/
│   ├── data.js              # Vercel serverless — Shopify + Meta + Klaviyo live
│   └── health.js            # Token check endpoint
├── scripts/
│   └── update-google.sh     # Google Ads handmatige update (30 sec)
├── vercel.json              # Routes: /api/data + /api/health
└── CNAME                    # dashboard.elunahome.nl
```

---

## Permissions

- Lees altijd, schrijf nooit naar Shopify/Meta/Klaviyo/Google — alleen data ophalen
- Google Ads: alleen lezen via UI of API, nooit campagnes aanpassen
