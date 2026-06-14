# ELÛNA dashboard — dagelijkse refresh-recept

Doel: `index.html` (in deze map, ELÛNA/ELÛNA DASHBOARD) elke ochtend bijwerken met verse cijfers.

## Databronnen (MCP-connectors, al gekoppeld)
1. **Shopify** — `shopify_list_orders` met `created_at_min` = 1e van de maand, `financial_status: paid`, `limit: 250`, `fields: id,created_at,total_price,subtotal_price,currency,financial_status`.
   - Omzet MTD = som van `total_price` (incl. 21% btw; ex btw = ÷1,21).
   - Orders = count. AOV = omzet ÷ orders. Stuks ≈ orders + multi-unit orders (regel €125,92 = 2 stuks).
2. **Meta Ads** — `ads_get_ad_entities`, account `924352226288770`, `level: account`, `date_preset: this_month`,
   fields: `spend, impressions, clicks, ctr, cpc, cpm, purchase_roas, reach, frequency`.
3. **Google Ads** — GEEN MCP beschikbaar. Handmatig via Chrome (claude-in-chrome). Account ELÛNA, klant-ID `470-420-6454`
   (`__c=4704206454`, login support@elunahome.nl). Open `ads.google.com/aw/campaigns`, zet periode op "Deze maand",
   lees rij **Totaal: account** → Kosten (= gspend), Conv.waarde, Conversies. Account-totaal, niet alleen "Geschikt"-filter.
4. **Drive marge-model** (vast, ref): bestand "ELÛNA - Market Research - Margins" — COGS €11,50 · logistiek €15,42 · fees+retouren €4,23 · brutomarge €26,35 · doel-CAC €14,45 · netto €10,89 (19%). Verkoop €69,95 (€57,81 ex btw).

## Berekende KPI's
- Totale spend = Meta-spend + Google-spend.
- Blended ROAS = omzet (incl btw) ÷ TOTALE spend (Meta + Google). NIET op alleen Meta.
- CAC = totale spend ÷ orders. Per stuk = totale spend ÷ stuks.
- Netto bij huidige CAC = brutomarge €26,35 − CAC per stuk.
- Platform-ROAS (Meta purchase_roas, Google conv.waarde/kosten) niet optellen — ze overlappen. Alleen blended is waar.
- Signaal ⚠️ als CAC/stuk > brutomarge €26,35; ✅ als blended ROAS > break-even (~1,8×).

## Snapshot 13-06-2026 (MTD 1–13 juni) — incl. Google
Omzet €1.287 · 19 orders · ~20 stuks · AOV €67,75.
Spend: Meta €574,55 + Google €503,64 = **€1.078,19 totaal**.
Blended ROAS **1,19×** · CAC €56,75/order (€53,91/stuk) → netto **−€27,56/stuk**.
Platform in-platform (onbetrouwbaar): Meta 0,55× · Google 1,42×.
Let op: vorige snapshot toonde 2,24× — dat was Meta-only en dus te gunstig.

## Watchlist (volgende keer expliciet checken)
- **Zoekterm "waterkoker" (kaal, exact) in NL - Shopping Campaign.** 30d (14 mei–12 jun): €116,56 voor 1 conversie = €116 CPA, ver boven marge €26,35. Bewust NIET genegativeerd: te dunne data (1 sale) en het is de kern-categorieterm + ~11k vertoningen/mnd top-of-funnel. Smart Bidding (doel-ROAS 315%) tempert 'm. Beslis op cijfers: houdt de €116-CPA over 60–90 dagen stand → reversibele exact-negatief `[waterkoker]` overwegen (blokkeert alleen de kale term, niet "waterkoker zonder plastic" e.d.). Zo niet → laten staan.
- Check ook of **PMax** gepauzeerd blijft (was 13 jun gepauzeerd) en of **brand-incrementaliteitstest** nog loopt/gewenst is.

## Werkwijze om te verversen
Vervang in `index.html` de waarden in het `P`-object (per periode: rev, orders, units, spend=Meta, gspend=Google, mroas, groas, ctr, cpc),
en update de datum in de header. Niets schrijven naar Shopify/Meta/Google — alleen lezen.
