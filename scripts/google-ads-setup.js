#!/usr/bin/env node
/**
 * Google Ads OAuth setup — genereer een refresh token
 *
 * Gebruik:
 *   node scripts/google-ads-setup.js
 *
 * Vereiste omgevingsvariabelen (tijdelijk lokaal):
 *   GOOGLE_CLIENT_ID      van Google Cloud Console
 *   GOOGLE_CLIENT_SECRET  van Google Cloud Console
 *
 * Of zet ze direct bovenaan dit bestand (regel 20-21).
 */

const http   = require('http');
const https  = require('https');
const url    = require('url');
const { exec } = require('child_process');

// --- Pas hier aan als je geen env vars wilt gebruiken ---
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
// --------------------------------------------------------

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nOntbrekende credentials. Zet ze bovenaan dit script of als env var:\n');
  console.error('  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-ads-setup.js\n');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:8765/callback';
const SCOPES = ['https://www.googleapis.com/auth/adwords'].join(' ');

const authUrl = `https://accounts.google.com/o/oauth2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n=== Google Ads OAuth Setup ===\n');
console.log('Stap 1: Browser opent Google login. Log in met het account dat toegang heeft tot Google Ads klant-ID 470-420-6454.\n');

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/callback') { res.end('wachten...'); return; }

  const code = parsed.query.code;
  if (!code) {
    res.writeHead(400);
    res.end('Geen code ontvangen. Probeer opnieuw.');
    server.close();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Gelukt.</h2><p>Je kunt dit venster sluiten. Kijk in de terminal voor de credentials.</p></body></html>');

  // Wissel code in voor tokens
  const tokenBody = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  });

  const tokenReq = https.request({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, tokenRes => {
    let data = '';
    tokenRes.on('data', d => data += d);
    tokenRes.on('end', () => {
      const json = JSON.parse(data);
      if (!json.refresh_token) {
        console.error('\nFout: geen refresh_token ontvangen. Zorg dat je "access_type=offline" en "prompt=consent" hebt gebruikt.\n');
        console.error('Response:', JSON.stringify(json, null, 2));
        server.close();
        return;
      }

      console.log('\n=== Klaar! Zet deze 4 env vars in Vercel ===\n');
      console.log(`GOOGLE_ADS_CLIENT_ID     = ${CLIENT_ID}`);
      console.log(`GOOGLE_ADS_CLIENT_SECRET = ${CLIENT_SECRET}`);
      console.log(`GOOGLE_ADS_REFRESH_TOKEN = ${json.refresh_token}`);
      console.log('\nGOOGLE_ADS_DEVELOPER_TOKEN = <zie ads.google.com/aw/apicenter>\n');
      console.log('Vercel instellen via:');
      console.log('  https://vercel.com/elunahome/dashboard/settings/environment-variables\n');
      console.log('Of via CLI:');
      console.log(`  vercel env add GOOGLE_ADS_CLIENT_ID production <<< "${CLIENT_ID}"`);
      console.log(`  vercel env add GOOGLE_ADS_CLIENT_SECRET production <<< "${CLIENT_SECRET}"`);
      console.log(`  vercel env add GOOGLE_ADS_REFRESH_TOKEN production <<< "${json.refresh_token}"`);
      console.log(`  vercel env add GOOGLE_ADS_DEVELOPER_TOKEN production <<< "<jouw-developer-token>"\n`);

      server.close();
    });
  });

  tokenReq.on('error', err => {
    console.error('Token request fout:', err.message);
    server.close();
  });

  tokenReq.write(tokenBody.toString());
  tokenReq.end();
});

server.listen(8765, () => {
  console.log('Lokale server luistert op http://localhost:8765\n');
  console.log('Browser opent automatisch...\n');
  const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${open} "${authUrl}"`, err => {
    if (err) {
      console.log('Kon browser niet automatisch openen. Open deze URL handmatig:\n');
      console.log(authUrl + '\n');
    }
  });
});
