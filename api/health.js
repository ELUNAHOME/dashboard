/**
 * ELÛNA Dashboard — /api/health
 * GET /api/health
 *
 * Controleert META_ACCESS_TOKEN geldigheid en vervaldatum.
 * Open in browser: https://dashboard.elunahome.nl/api/health
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dashboard.elunahome.nl');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') { res.status(405).end(); return; }

  const token = process.env.META_ACCESS_TOKEN;
  const out = { checked_at: new Date().toISOString(), meta_token: null };

  if (!token) {
    out.meta_token = { status: 'missing', warning: 'META_ACCESS_TOKEN env var niet ingesteld in Vercel' };
    return res.status(200).json(out);
  }

  try {
    // debug_token geeft is_valid + expires_at terug
    const r = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`
    );
    const d = await r.json();

    if (d.error) {
      out.meta_token = { status: 'error', message: d.error.message };
      return res.status(200).json(out);
    }

    const info = d.data || {};
    const neverExpires = info.expires_at === 0;
    const expiresAt = (!neverExpires && info.expires_at)
      ? new Date(info.expires_at * 1000)
      : null;
    const daysLeft = expiresAt
      ? Math.ceil((expiresAt - Date.now()) / 86_400_000)
      : null;

    let warning = null;
    if (!info.is_valid) {
      warning = 'Token ONGELDIG — opnieuw genereren in Meta Business Manager > Systeemgebruiker > Token genereren, kies Never als vervaldatum';
    } else if (!neverExpires && daysLeft !== null && daysLeft < 30) {
      warning = `Token verloopt over ${daysLeft} dag${daysLeft === 1 ? '' : 'en'} — HOOG RISICO. Genereer nu opnieuw met vervaldatum Never`;
    } else if (!neverExpires) {
      warning = `Token verloopt ${expiresAt?.toLocaleDateString('nl-NL')} — overweeg opnieuw genereren met vervaldatum Never`;
    }

    out.meta_token = {
      status: info.is_valid ? 'ok' : 'invalid',
      is_valid: info.is_valid,
      never_expires: neverExpires,
      expires_at: expiresAt?.toISOString() || (neverExpires ? 'never' : null),
      days_left: neverExpires ? null : daysLeft,
      scopes: info.scopes || [],
      warning
    };
  } catch (err) {
    out.meta_token = { status: 'error', message: err.message };
  }

  return res.status(200).json(out);
}
