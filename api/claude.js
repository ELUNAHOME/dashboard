export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://dashboard.elunahome.nl');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { message, context } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message vereist' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet ingesteld in Vercel' });

  const system = `Je bent de private data-analist van ELÛNA. ELÛNA verkoopt een stalen Calm Beige waterkoker (€69,95 incl. BTW) direct aan consumenten via elunahome.nl (Shopify). Je analyseert live marketing- en bedrijfsdata en geeft beknopt, uitvoerbaar advies in het Nederlands.

Vaste parameters:
- Brutomarge: €26,35/stuk (ex BTW)
- Break-even blended ROAS: 2,65×
- BTW: 21%
- Meta ad account: 924352226288770
- Google account: 470-420-6454 (Shopping/PMAX + Brand Search)
- Lead time Windspro (fabrikant): 45-65 dagen
- MOQ Windspro: 500 stuks
- CAPI staat bewust op "Aanbevolen" (niet Maximum — bewuste keuze, niet adviseren te veranderen)
- Klaviyo voor email/SMS marketing

Live dashboarddata (geselecteerde periode):
${context ? JSON.stringify(context, null, 2) : '(geen data beschikbaar)'}

Regels voor je antwoorden:
- Geen emoji's
- Geen samenvattende slotzin aan het einde
- Direct, concreet, uitvoerbaar
- Als iets niet uit de data te bepalen is, zeg dat expliciet
- Maximaal 3-4 alineas tenzij gevraagd om meer detail`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system,
        messages: [{ role: 'user', content: message }]
      })
    });

    const json = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: json.error?.message || 'Anthropic API fout' });

    res.setHeader('Access-Control-Allow-Origin', 'https://dashboard.elunahome.nl');
    res.json({ text: json.content?.[0]?.text || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
