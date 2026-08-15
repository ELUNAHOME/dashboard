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

## Shopify ziet maar 60 dagen (bekende beperking, 26 jul 2026)

De custom app mist de scope `read_all_orders`. Shopify levert dan **alleen orders van de
laatste 60 dagen**, stil, zonder fout. Gemeten: `/api/data?start=2025-12-01&end=2026-01-31`
gaf 0 orders (werkelijk 76 orders, €4.283), en "Maximaal" toonde €3.881 / 70 orders in
plaats van €15.322 netto / 316 orders.

Daarom komen maandhistorie, all-time en de P&L uit **`history.json`**, niet uit de API.
`histAfgerond()` en `pnlMaanden()` in `index.html` zijn de enige ingangen; er staan geen
maandbedragen of maandnamen meer hardgecodeerd in views. Bijwerken: zie REFRESH.md.

Definitief oplossen: in de Shopify-admin bij de custom app `read_all_orders` aanzetten,
daarna maandaggregatie in `api/data.js` bouwen en `history.json` overbodig maken.

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

## De fallback heeft nu een houdbaarheidsdatum (15 aug 2026, lees dit voor je Google aanraakt)

Tot 15 augustus 2026 viel de UI stil terug op `data.json` als de API `gspend: null` gaf, zonder
enige leeftijdscheck. Gemeten die dag: het dashboard toonde 444,88 Google-spend als augustus-MTD
terwijl dat cijfer uit data.json van 23 JULI kwam en Google werkelijk 190,81 had uitgegeven.
Blended ROAS stond daardoor op 2,28x in plaats van 4,41x, netto per stuk op MIN 8,29 in plaats
van PLUS 4,42, en de actiekaart adviseerde "budget bevriezen" terwijl schalen mocht. De
CONCLUSIE stond dus omgekeerd, en de badge zei ondertussen gewoon "live".

Vanaf nu geldt:
- `data.json` draagt `google_measured_at`. Zet die datum als je de Google-cijfers bijwerkt.
- Is die datum ouder dan `GOOGLE_FB_MAX_AGE_DAYS` (3), dan wordt Google NIET meer ingevuld:
  gspend blijft null, en blended ROAS plus CAC gaan zichtbaar op streepjes. Dat is bewust,
  een ontbrekend cijfer is eerlijk en een oud cijfer liegt.
- De echte oplossing blijft de 5 env vars hierboven in Vercel; dan is deze fallback dood hout.

Draai `python3 verify-dashboard.py` na elke wijziging (15 checks, plus `--zelftest` met 6
injecties). Die borgt ook dat de btw-basis niet opnieuw per tegel gaat verschillen.

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
netto = brutomarge (€23,67) - cac_per_unit
break_even_roas = 2,49× ex BTW  of  2,95× incl BTW
# Shopify stuurt standaard incl BTW naar Google → gebruik 2,95× als drempel
```

Herijkt 27 jul 2026 (aanvullingen 30 jul) op de werkelijke P&L, niet op het marge-model: netto omzet
€15.322 met brutomarge €6.155 is 40,2%, dus break-even = 15.322/6.155 = 2,49×.
De oude 2,19× en 2,65× kwamen uit een brutomarge van €26,35 die met 5% retouren
rekende; werkelijk is 17,5%.

Let op de aanname eronder: de P&L gaat ervan uit dat een geretourneerde ketel
terug de voorraad in gaat en opnieuw verkocht wordt. Blijkt dat niet zo, dan is
break-even circa 3,6× ex BTW. Uitvragen bij Four Fulfilment.

Meta in-platform ROAS (`mroas`) is NIET betrouwbaar, altijd blended gebruiken.

---

## Marge-model, en wat er werkelijk uitkomt

| Post | Model | Werkelijk (dec 2025 t/m 26 jul 2026) |
|------|-------|--------------------------------------|
| Verkoopprijs ex btw | €57,81 | €58,93 gerealiseerd per stuk |
| COGS | €11,50 | niet geverifieerd tegen leveranciersfactuur |
| Logistiek | €15,42 | uitgaand deel €7,20 klopt exact (Four Fulfilment) |
| Fees + retouren | €4,23 | retouren zijn 17,5%, niet 5% |
| **Brutomarge** | **€26,35** | **€23,67 per behouden stuk** |
| Doel-CAC | €14,45 | werkelijk €43,27 |
| Netto | €10,89 (19%) | −€19,60 per stuk |

Twee dingen die nog open staan en het model verder verslechteren:

1. Logistiek wordt per VERKOCHT stuk gerekend, Four Fulfilment factureert per
   VERZONDEN pakket. Dec t/m juni: 398 pakketten tegen 291 orders. Uitgaande
   porto in dat venster werkelijk circa €2.866 (398 x 7,20) tegen €1.728 in het
   model (240 behouden stuks x 7,20): gat circa €1.138.
2. COGS €11,50 en de €8,22 zeevracht, inklaring en verpakking zijn nergens tegen
   een factuur geverifieerd. Doe dat voor je hier conclusies op bouwt.

Four Fulfilment-tarieven, geverifieerd op facturen 2026-0005 t/m 2026-0135:
NL pakket €7,20 (dec 2025 nog €6,75), BE pakket €7,40, retourafhandeling €1,00.

---

## Bestandsstructuur

```
ELÛNA DASHBOARD/
├── index.html               # Dashboard shell, CSS, HTML, JS logic
├── data.json                # Statische fallback, bijwerken bij grote data-wijzigingen
├── history.json             # Maandhistorie + P&L-model, bron voor Maximaal en tab Winst
├── REFRESH.md               # Verversrecept
├── api/
│   ├── data.js              # Vercel serverless, Shopify + Meta + Klaviyo live
│   ├── health.js            # Token check endpoint
│   └── claude.js            # AI-analist-endpoint (systeemprompt bevat de marge-parameters!)
├── scripts/
│   └── update-google.sh     # Google Ads handmatige update (30 sec)
├── vercel.json              # Routes: /api/data + /api/health + /api/claude
└── CNAME                    # dashboard.elunahome.nl
```

---

## Permissions

- Lees standaard, schrijf niet naar Shopify/Klaviyo/Google, alleen data ophalen
- Meta Ads: lezen standaard. Ad-beheer (ads pauzeren, budget verlagen) mag na expliciet akkoord van Kevin, per actie. Nooit budget verhogen, ads/campagnes aanmaken of geld uitgeven zonder bevestiging. Tool toegestaan sinds 2026-06-29.
- Google Ads: alleen lezen via UI of API; wijzigingen alleen door Kevin zelf of op zijn expliciete per-actie opdracht (precedent 23 jul 2026: 9 negatives via Chrome op Kevins opdracht)
