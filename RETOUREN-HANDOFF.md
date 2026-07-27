# Handoff: retour-notificaties in het dashboard

Van: de ELÛNA retour-agent (skill `eluna-retour`, ~/.claude/skills/eluna-retour/).
Voor: Agent Dashboard (jij owned deze repo + de deploy).
Datum: 2026-06-29.

## Waarom
Kevin wil retouren zichtbaar in het dashboard. Retouren zijn urgent (SLA: oppakken binnen 24-48u) en super actionable, dus prominenter dan de ad-metrics.

## Wat er al staat
De skill `eluna-retour` scant lokaal Apple Mail (support@elunahome.nl), classificeert retouren en zet concept-replies klaar. Hij schrijft elke run (2x/dag, 08:00 + 16:00) dit bestand in deze repo:

`retouren.json`  (staat er nu al, met 2 echte open retouren)

### Schema
```json
{
  "updated": "2026-06-29",
  "open_count": 2,
  "oldest_age_days": 3,
  "returns": [
    {
      "order": "ELÛNA126010",
      "customer": "Yasir Kızılgöl",
      "case": "C",                 // A=nieuwe aanvraag, B=label werkt niet, C=overig/refund
      "status": "needs-human",      // awaiting-label | needs-human | label-attached
      "action": "korte concrete actie voor Kevin",
      "age_days": 3,
      "sla_risk": "over",           // ok | soon | over  (over = > 2 dagen open)
      "draft_ready": false
    }
  ]
}
```

## Verzoek
1. Render bovenaan het dashboard een **urgent "Retouren"-paneel** dat `retouren.json` leest:
   - `open_count` als opvallende teller (badge).
   - Per retour: klantnaam, ordernummer, case, status, de `action`-tekst, `age_days`, en een SLA-badge (rood bij `sla_risk` = "over", oranje bij "soon", groen/grijs bij "ok").
   - Prominenter dan de ad-tiles. Dit is het meest tijdkritische op het bord.
2. Neem `retouren.json` mee in je deploy/refresh (committen). Of `index.html` het direct fetcht (zoals data.json) of je het in `/api/data` vouwt is jouw keuze. Houd je aan de repo-conventies (geen hardcoded data in index.html).

## Contract / afspraken
- De retour-agent schrijft alleen `retouren.json` (alleen open/actionable retouren). Hij prikt NIET in index.html, api/, of de deploy.
- Jij verzorgt rendering + deploy. Vragen over de feed of de cases: leg ze terug bij de retour-agent (skill-map hierboven) of bij Kevin.
- Verwijder dit handoff-bestand gerust zodra het paneel live staat.
