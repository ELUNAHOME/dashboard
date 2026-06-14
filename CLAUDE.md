# ELÛNA Dashboard — CLAUDE.md

## Wat is dit
Statisch HTML dashboard voor ELÛNA (Calm Beige waterkoker, €69,95).
Live op: https://dashboard.elunahome.nl (GitHub Pages, repo: ELUNAHOME/dashboard)

Data wordt opgeslagen in `data.json`. De HTML laadt dit bestand bij elke pageload
en bij de "Ververs" knop in de header. Nooit direct data in `index.html` aanpassen.

---

## Dagelijkse refresh (de enige taak)

Voer dit uit om `data.json` bij te werken en live te zetten:

1. **Shopify** via MCP — `shopify_list_orders`
   - MTD: `created_at_min` = 1e van de maand, `financial_status: paid`, `limit: 250`
   - 7d: `created_at_min` = 7 dagen geleden
   - 30d: `created_at_min` = 30 dagen geleden
   - Bereken: `rev` = som `total_price`, `orders` = count, `units` = som quantities

2. **Meta Ads** via MCP — `ads_get_ad_entities`
   - Account ID: `924352226288770`, level: `campaign`
   - `date_preset`: `this_month`, `last_7d`, `last_30d`
   - Fields: `spend, impressions, clicks, ctr, cpm, cpc, purchase_roas`

3. **Klaviyo** via MCP — `query_metric_aggregates`
   - Metric IDs (niet wijzigen):
     - Opened Email: `X7Kyiq`
     - Received Email: `R7sRak`
     - Clicked Email: `SmuWpA`
     - Subscribed to Email: `Xw275a`
   - List ID: `TYEjdh`
   - Filter: MTD (1e van de maand → vandaag)

4. **Google Ads** — HANDMATIG (API pending, aanvraag 13-06-2026)
   - Klant-ID: `470-420-6454`, login: support@elunahome.nl
   - Haal op via ads.google.com: kosten, conv.waarde, conversies (periode: MTD)
   - Als niet beschikbaar: gebruik laatste bekende waarden uit data.json

5. **Update `data.json`** met nieuwe cijfers
6. **Push naar GitHub**: `git add data.json && git commit -m "data refresh [datum]" && git push`

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
├── index.html          # Dashboard shell — bevat CSS, HTML, JS logic
├── data.json           # Alle live cijfers — dit is het enige bestand dat dagelijks wijzigt
├── logo.png            # ELÛNA logo (1080×1080, source)
├── favicon.ico         # Browser favicon (16/32/48px)
├── favicon.png         # PNG favicon (32px)
├── apple-touch-icon.png # iOS/Android icon (180px, pistache achtergrond)
├── CNAME               # dashboard.elunahome.nl
└── REFRESH.md          # Uitgebreide handmatige refresh-instructies
```

---

## Permissions

- Lees altijd, schrijf nooit naar Shopify/Meta/Klaviyo/Google — alleen data ophalen
- Push uitsluitend naar `main` branch na expliciete bevestiging van de gebruiker
- Google Ads: alleen lezen via UI of API, nooit campagnes aanpassen
