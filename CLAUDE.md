# ELÛNA Dashboard, CLAUDE.md

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
| Google Ads | Automatisch via Google Ads API v21 (per campagne) | Live (mits 5 env vars gezet) |
| Google Ads (fallback) | Handmatig via `scripts/update-google.sh` | Fallback als API-creds ontbreken |

---

## Google Ads via API (primair, automatisch)

Basic Access goedgekeurd 16 jun 2026. De per-campagne breakdown (Shopping/PMAX,
Brand Search) komt live binnen zodra deze 5 env vars in Vercel staan:

| Var | Waarde / bron |
|-----|---------------|
| `GOOGLE_ADS_CLIENT_ID` | OAuth client (zie `scripts/google-ads-oauth.py`) |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth client (idem) |
| `GOOGLE_ADS_REFRESH_TOKEN` | genereren: `python3 scripts/google-ads-oauth.py` |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | ads.google.com/aw/apicenter onder ELÛNA Beheer |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | LEEG LATEN (zie waarschuwing) |

Operating account = `470-420-6454` (env `GOOGLE_ADS_CUSTOMER_ID`, default in code).
LET OP: MCC 789-710-2801 beheert 470-420-6454 NIET. support@elunahome.nl heeft
directe toegang, dus GEEN `login-customer-id` header sturen, anders faalt elke call
met USER_PERMISSION_DENIED. `GOOGLE_ADS_LOGIN_CUSTOMER_ID` leeg laten in Vercel.
Check live: `/api/data` → `google_note` moet "live · Google Ads API v21" zijn.

## Google Ads handmatig bijwerken (fallback, 30 seconden)

Alleen nodig als de API-creds ontbreken of falen.

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

1. **Shopify** via `shopify_list_orders`, MTD, 7d, 30d orders
2. **Meta** via `ads_get_ad_entities`, account 924352226288770, campaign niveau
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
| GOOGLE_ADS_CLIENT_ID | OAuth client (API, primair) |
| GOOGLE_ADS_CLIENT_SECRET | OAuth client (API) |
| GOOGLE_ADS_REFRESH_TOKEN | via google-ads-oauth.py (API) |
| GOOGLE_ADS_DEVELOPER_TOKEN | API Center ELÛNA Beheer (API) |
| GOOGLE_ADS_LOGIN_CUSTOMER_ID | LEEG (MCC beheert operating-account niet) |
| GOOGLE_SPEND_MTD | handmatig fallback (bijv. 503.64) |
| GOOGLE_GROAS_MTD | handmatig fallback (bijv. 1.42) |
| GOOGLE_SPEND_D30 | handmatig fallback |
| GOOGLE_GROAS_D30 | handmatig fallback |
| GOOGLE_SPEND_D7 | handmatig fallback (optioneel) |

---

## Berekeningen

```
blended_roas = rev / (meta_spend + google_spend)
cac_per_unit = (meta_spend + google_spend) / units
netto = brutomarge (€26,35) - cac_per_unit
break_even_roas = ~2.19× (ex BTW: 57,81/26,35) of ~2.66× (incl BTW: 69,95/26,35)
# Shopify stuurt standaard incl BTW naar Google → gebruik 2.65× als drempel
```

Meta in-platform ROAS (`mroas`) is NIET betrouwbaar, altijd blended gebruiken.

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
├── index.html               # Dashboard shell, CSS, HTML, JS logic
├── data.json                # Statische fallback, bijwerken bij grote data-wijzigingen
├── api/
│   ├── data.js              # Vercel serverless, Shopify + Meta + Klaviyo live
│   └── health.js            # Token check endpoint
├── scripts/
│   └── update-google.sh     # Google Ads handmatige update (30 sec)
├── vercel.json              # Routes: /api/data + /api/health
└── CNAME                    # dashboard.elunahome.nl
```

---

## Permissions

- Lees altijd, schrijf nooit naar Shopify/Meta/Klaviyo/Google, alleen data ophalen
- Google Ads: alleen lezen via UI of API, nooit campagnes aanpassen
