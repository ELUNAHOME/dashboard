/**
 * ELÛNA Dashboard — Vercel Serverless API
 * GET /api/data
 *
 * Aggregeert Shopify + Meta Ads + Klaviyo data naar het dashboard JSON-formaat.
 * Vervangt het statische data.json bestand.
 *
 * Vereiste env vars (in Vercel project settings):
 *   SHOPIFY_STORE          elunahome.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN   shpat_...
 *   META_ACCESS_TOKEN      EAA...
 *   META_AD_ACCOUNT        924352226288770
 *   KLAVIYO_API_KEY        pk_...
 */

// ── constanten ──────────────────────────────────────────────────────────────
const BTW          = 1.21;
const SHOPIFY_API  = '2024-01';
const META_API_VER = 'v19.0';
const KL_BASE      = 'https://a.klaviyo.com/api';

// Klaviyo metric IDs (niet wijzigen)
const KL_RECEIVED   = 'R7sRak';
const KL_OPENED     = 'X7Kyiq';
const KL_CLICKED    = 'SmuWpA';
const KL_SUBSCRIBED = 'Xw275a';
const KL_LIST_ID    = 'TYEjdh';

// ── hulpfuncties ─────────────────────────────────────────────────────────────
const r2 = n => Math.round(n * 100) / 100;

function amsDate(offsetDays = 0) {
  // Amsterdam tijd (CEST = UTC+2, CET = UTC+1)
  // Gebruik Intl om DST correct te bepalen
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d); // "YYYY-MM-DD"
}

function mtdStart() {
  const d = amsDate(0); // "YYYY-MM-DD"
  return d.slice(0, 8) + '01';
}

function dateLabel(start, end) {
  const fmt = s => {
    const [y, m, day] = s.split('-');
    return `${parseInt(day)} ${['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][parseInt(m)-1]} ${y}`;
  };
  if (start === end) return fmt(start);
  if (start.slice(0,7) === end.slice(0,7)) return `${parseInt(start.split('-')[2])}–${fmt(end)}`;
  return `${fmt(start)}–${fmt(end)}`;
}

// ── Shopify ──────────────────────────────────────────────────────────────────
async function shopifyFetch(path) {
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  const url = `https://${store}/admin/api/${SHOPIFY_API}${path}`;
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
  return res.json();
}

async function shopifyOrders(dateMin, dateMax) {
  const qs = new URLSearchParams({
    created_at_min: dateMin + 'T00:00:00+02:00',
    created_at_max:  dateMax + 'T23:59:59+02:00',
    financial_status: 'paid',
    limit: '250',
    fields: 'id,total_price,line_items,created_at'
  });
  const { orders = [] } = await shopifyFetch(`/orders.json?${qs}`);
  return orders;
}

function aggregateOrders(orders) {
  let rev = 0, units = 0;
  for (const o of orders) {
    rev += parseFloat(o.total_price);
    units += o.line_items.reduce((s, i) => s + i.quantity, 0);
  }
  return { rev: r2(rev), orders: orders.length, units };
}

function dailyBreakdown(orders, dateMin, dateMax) {
  // Bouw array van { d: "1/6", rev: n } voor elke dag in bereik
  const map = {};
  const start = new Date(dateMin + 'T00:00:00+02:00');
  const end   = new Date(dateMax + 'T23:59:59+02:00');
  const cur = new Date(start);
  while (cur <= end) {
    const key = `${cur.getDate()}/${cur.getMonth() + 1}`;
    map[key] = 0;
    cur.setDate(cur.getDate() + 1);
  }
  for (const o of orders) {
    const d = new Date(o.created_at);
    // Converteer naar Amsterdam tijd
    const ams = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
    const key = `${ams.getDate()}/${ams.getMonth() + 1}`;
    if (key in map) map[key] += parseFloat(o.total_price);
  }
  return Object.entries(map).map(([d, rev]) => ({ d, rev: r2(rev) }));
}

async function fetchShopify() {
  const today     = amsDate(0);
  const yesterday = amsDate(1);
  const d7Start   = amsDate(7);
  const d30Start  = amsDate(30);
  const mtd       = mtdStart();
  const d7End     = amsDate(1); // t/m gisteren voor 7d

  // Parallelle fetches
  const [todayOrders, yesterdayOrders, d7Orders, mtdOrders, d30Orders] = await Promise.all([
    shopifyOrders(today, today),
    shopifyOrders(yesterday, yesterday),
    shopifyOrders(d7Start, today),
    shopifyOrders(mtd, today),
    shopifyOrders(d30Start, today)
  ]);

  const todayAgg     = aggregateOrders(todayOrders);
  const yesterdayAgg = aggregateOrders(yesterdayOrders);
  const d7Agg        = aggregateOrders(d7Orders);
  const mtdAgg       = aggregateOrders(mtdOrders);
  const d30Agg       = aggregateOrders(d30Orders);

  const mtdDays = parseInt(today.split('-')[2]);

  return {
    P: {
      today: {
        label: 'Vandaag', range: dateLabel(today, today),
        ...todayAgg,
        spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null
      },
      gisteren: {
        label: 'Gisteren', range: dateLabel(yesterday, yesterday),
        ...yesterdayAgg,
        spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null
      },
      d7: {
        label: '7 dagen', range: dateLabel(d7Start, today),
        ...d7Agg,
        spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null
      },
      mtd: {
        label: 'Deze maand', range: dateLabel(mtd, today),
        ...mtdAgg,
        spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null
      },
      d30: {
        label: '30 dagen', range: dateLabel(d30Start, today),
        ...d30Agg,
        spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null
      }
    },
    daily_mtd: dailyBreakdown(mtdOrders, mtd, today),
    daily_d7:  dailyBreakdown(d7Orders, d7Start, today),
    _dates: { today, yesterday, d7Start, mtd, d30Start, mtdDays }
  };
}

// ── Meta Ads ─────────────────────────────────────────────────────────────────
async function metaFetch(path, params = {}) {
  const token   = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT || '924352226288770';
  const base    = `https://graph.facebook.com/${META_API_VER}/act_${account}`;
  const qs      = new URLSearchParams({ access_token: token, ...params });
  const res = await fetch(`${base}${path}?${qs}`);
  if (!res.ok) throw new Error(`Meta ${res.status}: ${await res.text()}`);
  return res.json();
}

async function metaCampaignInsights(preset) {
  // Haal campagnes op met insights voor het opgegeven preset
  const fields = [
    'name', 'status', 'effective_status',
    `insights.date_preset(${preset}){spend,impressions,clicks,ctr,cpm,cpc,purchase_roas}`
  ].join(',');
  const { data = [] } = await metaFetch('/campaigns', { fields, limit: '50' });

  return data
    .map(c => {
      const ins = c.insights?.data?.[0];
      if (!ins) return null;
      const spend = parseFloat(ins.spend || '0');
      if (spend === 0) return null; // skip inactive
      const roas = ins.purchase_roas?.[0]?.value;
      return {
        name: c.name,
        spend: r2(spend),
        imp: parseInt(ins.impressions || '0'),
        clicks: parseInt(ins.clicks || '0'),
        ctr: r2(parseFloat(ins.ctr || '0')),
        cpm: r2(parseFloat(ins.cpm || '0')),
        cpc: r2(parseFloat(ins.cpc || '0')),
        roas: roas ? r2(parseFloat(roas)) : null
      };
    })
    .filter(Boolean);
}

async function metaTotals(campaigns) {
  if (!campaigns.length) return { spend: 0, ctr: null, cpc: null, mroas: null };
  const spend = r2(campaigns.reduce((s, c) => s + c.spend, 0));
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalImp    = campaigns.reduce((s, c) => s + c.imp, 0);
  const ctr  = totalImp > 0 ? r2((totalClicks / totalImp) * 100) : null;
  const cpc  = totalClicks > 0 ? r2(spend / totalClicks) : null;
  return { spend, ctr, cpc };
}

async function fetchMeta(shopifyP) {
  const presets = ['today', 'yesterday', 'last_7d', 'this_month', 'last_30d'];
  const keys    = ['today', 'gisteren', 'd7', 'mtd', 'd30'];

  const results = await Promise.all(presets.map(p => metaCampaignInsights(p)));

  const C = {};
  const metaSpend = {};
  keys.forEach((k, i) => {
    C[k] = results[i];
    const tot = metaTotals(results[i]);
    metaSpend[k] = tot;
  });

  return { C, metaSpend };
}

// ── Klaviyo ───────────────────────────────────────────────────────────────────
async function klFetch(endpoint, body) {
  const key = process.env.KLAVIYO_API_KEY;
  const res = await fetch(`${KL_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${key}`,
      'Content-Type': 'application/json',
      'revision': '2024-02-15'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Klaviyo ${res.status}: ${await res.text()}`);
  return res.json();
}

async function klCount(metricId, dateStart, dateEnd, filterList = false) {
  const filter = filterList
    ? `and(greater-or-equal(datetime,${dateStart}T00:00:00+00:00),less-or-equal(datetime,${dateEnd}T23:59:59+00:00),equals(list,["${KL_LIST_ID}"]))`
    : `and(greater-or-equal(datetime,${dateStart}T00:00:00+00:00),less-or-equal(datetime,${dateEnd}T23:59:59+00:00))`;

  const body = {
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: metricId,
        interval: 'month',
        measurements: ['unique'],
        filter,
        timezone: 'Europe/Amsterdam'
      }
    }
  };
  const { data } = await klFetch('/metric-aggregates/', body);
  const val = data?.attributes?.data?.[0]?.measurements?.unique?.[0];
  return typeof val === 'number' ? val : 0;
}

async function fetchKlaviyo(dateStart, dateEnd) {
  const [received, opened, clicked, subscribed] = await Promise.all([
    klCount(KL_RECEIVED, dateStart, dateEnd),
    klCount(KL_OPENED, dateStart, dateEnd),
    klCount(KL_CLICKED, dateStart, dateEnd),
    klCount(KL_SUBSCRIBED, dateStart, dateEnd, true)
  ]);

  const openRate  = received > 0 ? r2((opened  / received) * 100) : 0;
  const clickRate = received > 0 ? r2((clicked / received) * 100) : 0;

  // Flows en campagnes blijven statisch — Klaviyo flow-rapport API vereist
  // aparte uitbreiding. Waarden uit data.json worden hier doorgegeven als fallback.
  return {
    list_id: KL_LIST_ID,
    mtd_received: received,
    mtd_opened_unique: opened,
    mtd_clicked_unique: clicked,
    mtd_new_subscribers: subscribed,
    open_rate_pct: openRate,
    click_rate_pct: clickRate,
    // Flows + campaigns: zie aparte /api/klaviyo-flows route (TODO)
    flows: null,
    campaigns: null
  };
}

// ── main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://dashboard.elunahome.nl');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache: 5 min fresh, 10 min stale
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Validatie env vars
  const missing = ['SHOPIFY_STORE','SHOPIFY_ACCESS_TOKEN','META_ACCESS_TOKEN','KLAVIYO_API_KEY']
    .filter(k => !process.env[k]);
  if (missing.length) {
    res.status(500).json({ error: `Ontbrekende env vars: ${missing.join(', ')}` });
    return;
  }

  try {
    const [shopify, metaResult, klaviyo] = await Promise.all([
      fetchShopify(),
      fetchMeta(),
      fetchKlaviyo(mtdStart(), amsDate(0))
    ]);

    const { P, daily_mtd, daily_d7, _dates } = shopify;
    const { C, metaSpend } = metaResult;

    // Verrijk P met Meta spend + blended ROAS
    // gspend blijft null totdat Google API live is
    for (const k of ['today','gisteren','d7','mtd','d30']) {
      const meta = metaSpend[k] || {};
      P[k].spend  = meta.spend  ?? null;
      P[k].ctr    = meta.ctr    ?? null;
      P[k].cpc    = meta.cpc    ?? null;
      P[k].gspend = null; // Google Ads handmatig
      P[k].mroas  = null; // in-platform ROAS niet betrouwbaar
      P[k].groas  = null;
    }

    const now = new Date();
    const result = {
      updated: now.toISOString(),
      updated_label: now.toLocaleDateString('nl-NL', {
        timeZone: 'Europe/Amsterdam',
        day: 'numeric', month: 'long', year: 'numeric'
      }),
      google_note: 'handmatig · Google API pending',
      P,
      C,
      daily_mtd,
      daily_d7,
      klaviyo
    };

    res.status(200).json(result);
  } catch (err) {
    console.error('[/api/data] error:', err);
    res.status(500).json({ error: err.message });
  }
}
