# ELÛNA dashboard — refresh-recept

Doel: het dashboard elke ochtend van verse cijfers voorzien. De dagelijkse cijfers komen
live uit `/api/data`; de maandhistorie en de P&L komen uit `history.json` en moeten
maandelijks met de hand ververst worden.

## HARDE BEPERKING: 60 dagen (lees dit eerst)

De Shopify-app achter `SHOPIFY_ACCESS_TOKEN` mist de scope **`read_all_orders`**. Shopify
geeft zo'n app alleen orders van de **laatste 60 dagen**. Alles daarbuiten komt terug als
nul, zonder foutmelding. Gevolg (gemeten 26 jul 2026): `/api/data?start=2025-12-01&end=2026-01-31`
gaf 0 orders terwijl er in werkelijkheid 76 orders en €4.283 omzet waren, en de knop
"Maximaal" toonde €3.881 over 70 orders in plaats van €15.322 netto over 316 orders.

Daarom leest het dashboard alle maand- en all-time-weergaven uit `history.json`, niet uit
de API. Wil je dit wél live: vraag in de Shopify-admin bij de custom app de scope
`read_all_orders` aan (Instellingen → Apps → app → API-scopes), en zet daarna de
maandaggregatie in `api/data.js`. Tot die tijd geldt: **elke all-time-weergave die niet
uit `history.json` komt, is te laag.**

## history.json bijwerken (maandelijks, na afsluiten van de maand)

**Tel gifting-orders NIET mee.** Creator-seeding levert echte Shopify-orders op met
financial_status "paid" en totaal 0,00. Ze horen in de voorraad en de logistiek, maar niet
in `orders` of `stuks`, want ze staan wel in de noemer van AOV en CAC en leveren niets op.
Gemeten 17 aug 2026: 3 van de 38 orders in 30 dagen waren gifting, wat de AOV op 60,93
zette in plaats van 66,16, en over 7 dagen op 51,47 in plaats van 65,50. De live API filtert
ze sinds 17 aug zelf (`api/data.js`, functie `shopifyOrders`); voor deze handmatige
maandregel moet je het zelf doen. Tel ze met:
`orders(query:"created_at:>=<maand> created_at:<=<maandeind>")` en sluit alles uit met
`totalPriceSet.shopMoney.amount == 0`. Noteer het aantal in de `_comment` van die maand.

Voeg één regel per afgesloten maand toe. Alle bedragen ex btw:

1. **Shopify** (via de Shopify-connector, die ziet wél de hele historie):
   `FROM sales SHOW orders, gross_sales, discounts, returns, net_sales, taxes, net_items_sold TIMESERIES month SINCE <maand> UNTIL <maand-eind>`
   → `orders`, `bruto_omzet`, `kortingen`, `retouren` (positief noteren), `netto_omzet`, `btw`, `stuks` (= net_items_sold).
2. **Retour-orders**: GraphQL `orders(query:"created_at:>=… financial_status:refunded,partially_refunded")`, tel de nodes → `retour_orders`.
3. **Meta**: `ads_get_ad_entities`, account 924352226288770, `level: ad_account`, `time_increment: monthly` → `meta_spend`.
4. **Google**: `python3 google-ads/2026-06-13-google-ads-client.py account 2026-08-01,2026-08-31` → `costEur` = `google_spend`.

Verifieer daarna in het dashboard, tab Winst: de regel "Totaal" van de maandtabel moet
optellen tot dezelfde netto omzet als de som van de maanden. Niets anders aanpassen:
`index.html` rekent alles zelf uit `history.json`.

## Dagelijkse cijfers

## Databronnen (MCP-connectors, al gekoppeld)
1. **Shopify** — `shopify_list_orders` met `created_at_min` = 1e van de maand, `financial_status: paid`, `limit: 250`, `fields: id,created_at,total_price,subtotal_price,currency,financial_status`.
   - Omzet MTD = som van `total_price` (incl. 21% btw; ex btw = ÷1,21).
   - Orders = count. AOV = omzet ÷ orders. Stuks ≈ orders + multi-unit orders (regel €125,92 = 2 stuks).
2. **Meta Ads** — `ads_get_ad_entities`, account `924352226288770`, `level: account`, `date_preset: this_month`,
   fields: `spend, impressions, clicks, ctr, cpc, cpm, purchase_roas, reach, frequency`.
3. **Google Ads** — GEEN MCP beschikbaar. Handmatig via Chrome (claude-in-chrome). Account ELÛNA, klant-ID `470-420-6454`
   (`__c=4704206454`, login support@elunahome.nl). Open `ads.google.com/aw/campaigns`, zet periode op "Deze maand",
   lees rij **Totaal: account** → Kosten (= gspend), Conv.waarde, Conversies. Account-totaal, niet alleen "Geschikt"-filter.
4. **Drive marge-model** (ref, ACHTERHAALD op de kernaannames): bestand "ELÛNA - Market Research - Margins" rekent met COGS €11,50 · logistiek €15,42 · fees+retouren €4,23 · brutomarge €26,35 · doel-CAC €14,45. Herijkt 27 jul 2026 op de werkelijke P&L (aanvullingen 30 jul): retouren zijn 17,5% (niet 5%), brutomarge per behouden stuk €23,67, break-even ROAS 2,49x ex btw en 2,95x incl btw. Gebruik de tabel in CLAUDE.md ("Marge-model, en wat er werkelijk uitkomt"), niet dit Drive-bestand, voor drempels.

## Berekende KPI's
- Totale spend = Meta-spend + Google-spend.
- Blended ROAS = omzet (incl btw) ÷ TOTALE spend (Meta + Google). NIET op alleen Meta.
- CAC = totale spend ÷ orders. Per stuk = totale spend ÷ stuks.
- Netto bij huidige CAC = brutomarge €23,67 per behouden stuk − CAC per stuk (herijkt, zie CLAUDE.md).
- Platform-ROAS (Meta purchase_roas, Google conv.waarde/kosten) niet optellen — ze overlappen. Alleen blended is waar.
- Signaal ⚠️ als CAC/stuk > brutomarge €23,67; ✅ als blended ROAS (incl btw) > break-even 2,95×.

## Snapshot 13-06-2026 (MTD 1–13 juni) — incl. Google
Omzet €1.287 · 19 orders · ~20 stuks · AOV €67,75.
Spend: Meta €574,55 + Google €503,64 = **€1.078,19 totaal**.
Blended ROAS **1,19×** · CAC €56,75/order (€53,91/stuk) → netto **−€27,56/stuk**.
Platform in-platform (onbetrouwbaar): Meta 0,55× · Google 1,42×.
Let op: vorige snapshot toonde 2,24× — dat was Meta-only en dus te gunstig.

## Watchlist (volgende keer expliciet checken)
- **Zoekterm "waterkoker" (kaal, exact) in NL - Shopping Campaign.** 30d (14 mei–12 jun): €116,56 voor 1 conversie = €116 CPA, ver boven marge €23,67. Bewust NIET genegativeerd: te dunne data (1 sale) en het is de kern-categorieterm + ~11k vertoningen/mnd top-of-funnel. Smart Bidding (doel-ROAS 315%) tempert 'm. Beslis op cijfers: houdt de €116-CPA over 60–90 dagen stand → reversibele exact-negatief `[waterkoker]` overwegen (blokkeert alleen de kale term, niet "waterkoker zonder plastic" e.d.). Zo niet → laten staan.
- Check ook of **PMax** gepauzeerd blijft (was 13 jun gepauzeerd) en of **brand-incrementaliteitstest** nog loopt/gewenst is.

## Werkwijze om te verversen
Vervang in `index.html` de waarden in het `P`-object (per periode: rev, orders, units, spend=Meta, gspend=Google, mroas, groas, ctr, cpc),
en update de datum in de header. Niets schrijven naar Shopify/Meta/Google — alleen lezen.
