/**
 * ELÛNA Dashboard — Vercel Serverless API
 * GET /api/data
 *
 * Aggregeert Shopify + Meta Ads + Klaviyo data naar het dashboard JSON-formaat.
 *
 * Vereiste env vars (Vercel project settings):
 *   SHOPIFY_STORE          elunahome.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN   shpat_...
 *   META_ACCESS_TOKEN      EAA...
 *   META_AD_ACCOUNT        924352226288770
 *   KLAVIYO_API_KEY        pk_...
 *
 * Optionele env vars — Google Ads handmatig (update via scripts/update-google.sh):
 *   GOOGLE_SPEND_TODAY / GOOGLE_GROAS_TODAY
 *   GOOGLE_SPEND_GISTEREN / GOOGLE_GROAS_GISTEREN
 *   GOOGLE_SPEND_D7 / GOOGLE_GROAS_D7
 *   GOOGLE_SPEND_MTD / GOOGLE_GROAS_MTD
 *   GOOGLE_SPEND_D30 / GOOGLE_GROAS_D30
 */

// ── constanten ──────────────────────────────────────────────────────────────
const BTW          = 1.21;
const SHOPIFY_API  = '2024-01';
const META_API_VER = 'v19.0';
const KL_BASE      = 'https://a.klaviyo.com/api';

// Klaviyo metric IDs
const KL_RECEIVED     = 'R7sRak';
const KL_OPENED       = 'X7Kyiq';
const KL_CLICKED      = 'SmuWpA';
const KL_SUBSCRIBED   = 'Xw275a';
const KL_PLACED_ORDER = 'RP7a8m';
const KL_LIST_ID      = 'TYEjdh';

// ── hulpfuncties ─────────────────────────────────────────────────────────────
const r2 = n => Math.round(n * 100) / 100;

function amsDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

function mtdStart() {
  const d = amsDate(0);
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Google Ads API ───────────────────────────────────────────────────────────
async function getGoogleAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type:    'refresh_token'
    })
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

async function googleAdsQuery(accessToken, duringPeriod) {
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '4704206454').replace(/-/g, '');
  const headers = {
    'Authorization':   `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    'Content-Type':    'application/json'
  };
  const url = `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`;

  const [totalsRes, campsRes] = await Promise.all([
    fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({
        query: `SELECT metrics.cost_micros, metrics.conversions_value FROM customer WHERE segments.date DURING ${duringPeriod}`
      })
    }),
    fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({
        query: `SELECT campaign.name, campaign.advertising_channel_type, metrics.cost_micros, metrics.conversions_value, metrics.impressions, metrics.clicks FROM campaign WHERE segments.date DURING ${duringPeriod} AND campaign.status != 'REMOVED' AND metrics.cost_micros > 0`
      })
    })
  ]);

  if (!totalsRes.ok) throw new Error(`Google Ads ${totalsRes.status}: ${await totalsRes.text()}`);
  const totalsData = await totalsRes.json();
  const m = totalsData?.results?.[0]?.metrics || {};
  const spend = parseInt(m.costMicros || 0) / 1e6;
  const conv  = parseFloat(m.conversionsValue || 0);

  let gcamps = [];
  if (campsRes.ok) {
    const campsData = await campsRes.json();
    gcamps = (campsData?.results || []).map(r => {
      const cSpend  = parseInt(r.metrics?.costMicros || 0) / 1e6;
      const cConv   = parseFloat(r.metrics?.conversionsValue || 0);
      const cClicks = parseInt(r.metrics?.clicks || 0);
      const cImp    = parseInt(r.metrics?.impressions || 0);
      const chType  = r.campaign?.advertisingChannelType || '';
      const typeLabel = chType === 'SHOPPING' ? 'Shopping'
                      : chType === 'PERFORMANCE_MAX' ? 'PMax'
                      : chType === 'SEARCH' ? 'Search'
                      : chType;
      return {
        name:   r.campaign?.name || 'Onbekend',
        type:   typeLabel,
        spend:  r2(cSpend),
        imp:    cImp,
        clicks: cClicks,
        cpc:    cClicks > 0 ? r2(cSpend / cClicks) : null,
        roas:   cSpend > 0 ? r2(cConv / cSpend) : null
      };
    }).filter(c => c.spend > 0);
  }

  return {
    gspend: spend > 0 ? r2(spend) : null,
    groas:  spend > 0 ? r2(conv / spend) : null,
    gcamps
  };
}

async function fetchGoogleAds() {
  const hasApiCreds = process.env.GOOGLE_ADS_CLIENT_ID &&
                      process.env.GOOGLE_ADS_CLIENT_SECRET &&
                      process.env.GOOGLE_ADS_REFRESH_TOKEN &&
                      process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!hasApiCreds) return { data: getGoogleManual(), source: 'manual' };

  try {
    const token = await getGoogleAccessToken();
    const periods = { today: 'TODAY', gisteren: 'YESTERDAY', d7: 'LAST_7_DAYS', mtd: 'THIS_MONTH', d30: 'LAST_30_DAYS' };
    const entries = await Promise.all(
      Object.entries(periods).map(([k, p]) => googleAdsQuery(token, p).then(v => [k, v]))
    );
    const data = Object.fromEntries(entries);
    const GC = Object.fromEntries(entries.map(([k, v]) => [k, v.gcamps || []]));
    return { data, GC, source: 'api' };
  } catch(err) {
    console.error('Google Ads API fout, fallback naar handmatig:', err.message);
    return { data: getGoogleManual(), GC: {}, source: 'manual' };
  }
}

// Handmatige fallback (gebruikt als API creds ontbreken of API faalt)
function getGoogleManual() {
  const p = v => (v && !isNaN(v)) ? parseFloat(v) : null;
  return {
    today:    { gspend: p(process.env.GOOGLE_SPEND_TODAY),    groas: p(process.env.GOOGLE_GROAS_TODAY) },
    gisteren: { gspend: p(process.env.GOOGLE_SPEND_GISTEREN), groas: p(process.env.GOOGLE_GROAS_GISTEREN) },
    d7:       { gspend: p(process.env.GOOGLE_SPEND_D7),       groas: p(process.env.GOOGLE_GROAS_D7) },
    mtd:      { gspend: p(process.env.GOOGLE_SPEND_MTD),      groas: p(process.env.GOOGLE_GROAS_MTD) },
    d30:      { gspend: p(process.env.GOOGLE_SPEND_D30),      groas: p(process.env.GOOGLE_GROAS_D30) },
  };
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
    status: 'any',
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
  const map = {};
  const addDay = s => {
    const d = new Date(s + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const toKey = s => {
    const [, m, day] = s.split('-');
    return `${parseInt(day)}/${parseInt(m)}`;
  };
  let cur = dateMin;
  while (cur <= dateMax) {
    map[toKey(cur)] = 0;
    cur = addDay(cur);
  }
  for (const o of orders) {
    const ad = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(o.created_at));
    const key = toKey(ad);
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

  // Prev-period dates voor delta badges
  const dayNum = parseInt(today.split('-')[2]);
  const [yr, mo] = today.split('-').map(Number);
  const prevMo = mo === 1 ? 12 : mo - 1;
  const prevYr = mo === 1 ? yr - 1 : yr;
  const prevMtdS = `${prevYr}-${String(prevMo).padStart(2,'0')}-01`;
  const prevMtdE = `${prevYr}-${String(prevMo).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;

  const [
    todayOrders, yesterdayOrders, d7Orders, mtdOrders, d30Orders,
    prevGisterenOrders, prevD7Orders, prevMtdOrders, prevD30Orders
  ] = await Promise.all([
    shopifyOrders(today, today),
    shopifyOrders(yesterday, yesterday),
    shopifyOrders(d7Start, today),
    shopifyOrders(mtd, today),
    shopifyOrders(d30Start, today),
    shopifyOrders(amsDate(2), amsDate(2)),
    shopifyOrders(amsDate(14), amsDate(8)),
    shopifyOrders(prevMtdS, prevMtdE),
    shopifyOrders(amsDate(60), amsDate(31))
  ]);

  const todayAgg        = aggregateOrders(todayOrders);
  const yesterdayAgg    = aggregateOrders(yesterdayOrders);
  const d7Agg           = aggregateOrders(d7Orders);
  const mtdAgg          = aggregateOrders(mtdOrders);
  const d30Agg          = aggregateOrders(d30Orders);
  const prevGisterenAgg = aggregateOrders(prevGisterenOrders);
  const prevD7Agg       = aggregateOrders(prevD7Orders);
  const prevMtdAgg      = aggregateOrders(prevMtdOrders);
  const prevD30Agg      = aggregateOrders(prevD30Orders);

  const mtdDays = parseInt(today.split('-')[2]);

  return {
    P: {
      today:    { label: 'Vandaag',      range: dateLabel(today, today),         ...todayAgg,     spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null, prev_rev: yesterdayAgg.rev,    prev_orders: yesterdayAgg.orders },
      gisteren: { label: 'Gisteren',     range: dateLabel(yesterday, yesterday),  ...yesterdayAgg, spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null, prev_rev: prevGisterenAgg.rev, prev_orders: prevGisterenAgg.orders },
      d7:       { label: '7 dagen',      range: dateLabel(d7Start, today),        ...d7Agg,        spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null, prev_rev: prevD7Agg.rev,       prev_orders: prevD7Agg.orders },
      mtd:      { label: 'Deze maand',   range: dateLabel(mtd, today),            ...mtdAgg,       spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null, prev_rev: prevMtdAgg.rev,      prev_orders: prevMtdAgg.orders },
      d30:      { label: '30 dagen',     range: dateLabel(d30Start, today),       ...d30Agg,       spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null, prev_rev: prevD30Agg.rev,      prev_orders: prevD30Agg.orders }
    },
    daily_mtd:      dailyBreakdown(mtdOrders,     mtd,        today),
    daily_d7:       dailyBreakdown(d7Orders,      d7Start,    today),
    daily_d30:      dailyBreakdown(d30Orders,     d30Start,   today),
    daily_prev_d7:  dailyBreakdown(prevD7Orders,  amsDate(14), amsDate(8)),
    daily_prev_mtd: dailyBreakdown(prevMtdOrders, prevMtdS,   prevMtdE),
    daily_prev_d30: dailyBreakdown(prevD30Orders, amsDate(60), amsDate(31)),
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
      if (spend === 0) return null;
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

// Niet async — geen await nodig (bug fix: was async, werd nooit awaited)
function metaTotals(campaigns) {
  if (!campaigns.length) return { spend: null, ctr: null, cpc: null };
  const spend = r2(campaigns.reduce((s, c) => s + c.spend, 0));
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalImp    = campaigns.reduce((s, c) => s + c.imp, 0);
  const ctr  = totalImp > 0 ? r2((totalClicks / totalImp) * 100) : null;
  const cpc  = totalClicks > 0 ? r2(spend / totalClicks) : null;
  return { spend, ctr, cpc };
}

async function fetchMeta() {
  const presets = ['today', 'yesterday', 'last_7d', 'this_month', 'last_30d'];
  const keys    = ['today', 'gisteren', 'd7', 'mtd', 'd30'];

  const results = await Promise.all(presets.map(p => metaCampaignInsights(p)));

  const C = {};
  const metaSpend = {};
  keys.forEach((k, i) => {
    C[k] = results[i];
    metaSpend[k] = metaTotals(results[i]); // niet async, geen await nodig
  });

  return { C, metaSpend };
}

// ── Klaviyo helpers ───────────────────────────────────────────────────────────
function klHeaders() {
  return {
    'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
    'Content-Type': 'application/json',
    'revision': '2024-02-15'
  };
}

async function klCount(metricId, dateStart, dateEnd) {
  const filter = `and(greater-or-equal(datetime,${dateStart}T00:00:00+00:00),less-than(datetime,${dateEnd}T23:59:59+00:00))`;
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
  const res = await fetch(`${KL_BASE}/metric-aggregates/`, {
    method: 'POST', headers: klHeaders(), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Klaviyo ${res.status}: ${await res.text()}`);
  const { data } = await res.json();
  const val = data?.attributes?.data?.[0]?.measurements?.unique?.[0];
  return typeof val === 'number' ? val : 0;
}

function cleanFlowName(name) {
  return name
    .replace(/^ELÛNA \| /, '')
    .replace(/ - A\/B Version - CANVA$/, '')
    .replace(/ - CANVA$/, '');
}

function flowTrigger(name, triggerType) {
  const n = (name || '').toLowerCase();
  if (n.includes('welcome')) return 'Nieuwe abonnee';
  if (n.includes('browse')) return 'Product bekeken, niet gekocht';
  if (n.includes('checkout') || n.includes('abandoned cart')) return 'Checkout gestart, niet afgerond';
  if (n.includes('review') || n.includes('trustpilot')) return 'Na levering';
  return triggerType === 'Added to List' ? 'Nieuwe abonnee' : (triggerType || 'Onbekend');
}

function flowNote(stats, name) {
  const or = r2((stats.open_rate || 0) * 100);
  const cr = r2((stats.click_rate || 0) * 100);
  const isReview = (name || '').toLowerCase().includes('review') || (name || '').toLowerCase().includes('trustpilot');

  if (isReview) {
    // Review flows hebben geen conversies per definitie (product al betaald)
    if (cr === 0) return `Open rate ${or}% · CTR 0% — review-CTA werkt niet, A/B testen.`;
    return `Open rate ${or}% · CTR ${cr}% naar Trustpilot.`;
  }
  if (stats.conversions > 0) {
    return `${stats.conversions} conversie${stats.conversions > 1 ? 's' : ''} · €${(stats.conversion_value || 0).toFixed(2)} omzet in 30 dagen.`;
  }
  if (or > 35 && cr < 2) return `Open rate sterk (${or}%). CTR zwak (${cr}%) — CTA of aanbod werkt niet.`;
  if (or < 25) return `Open rate laag (${or}%) — onderwerp of afzender testen.`;
  if ((stats.recipients || 0) < 12) return `Weinig triggers (${stats.recipients}) — mogelijk tracking-probleem.`;
  return `${or}% open · ${cr}% CTR · 0 conversies in 30 dagen.`;
}

function campaignNote(stats) {
  if ((stats.conversions || 0) > 0) {
    return `${stats.conversions} conversie${stats.conversions > 1 ? 's' : ''} · €${(stats.conversion_value || 0).toFixed(2)} omzet.`;
  }
  if ((stats.clicks_unique || 0) > 0) {
    return `${stats.clicks_unique} unieke klikken, 0 conversies — coupon of LP werkte niet.`;
  }
  return `${r2((stats.open_rate || 0) * 100)}% open · ${r2((stats.click_rate || 0) * 100)}% CTR · 0 conversies.`;
}

async function fetchKlaviyoFlows() {
  const res = await fetch(`${KL_BASE}/flow-values-reports/`, {
    method: 'POST',
    headers: { ...klHeaders(), 'Content-Type': 'application/vnd.api+json' },
    body: JSON.stringify({
      data: {
        type: 'flow-values-report',
        attributes: {
          timeframe: { key: 'last_30_days' },
          conversion_metric_id: KL_PLACED_ORDER,
          filter: 'equals(send_channel,"email")'
        }
      }
    })
  });
  if (!res.ok) throw new Error(`Klaviyo flow report ${res.status}: ${await res.text()}`);
  const { data } = await res.json();

  const aggregation = data?.attributes?.flow_aggregation || [];
  const results     = data?.attributes?.results || [];

  // Aantal berichten per flow tellen vanuit results
  const msgCount = {};
  for (const r of results) {
    const fid = r.groupings?.flow_id;
    if (fid) msgCount[fid] = (msgCount[fid] || 0) + 1;
  }

  return aggregation
    .filter(f => f.flow_details?.attributes?.status === 'live')
    .map(f => {
      const attr = f.flow_details?.attributes || {};
      const s    = f.statistics || {};
      return {
        name:             cleanFlowName(attr.name || ''),
        trigger:          flowTrigger(attr.name, attr.trigger_type),
        status:           attr.status,
        messages:         msgCount[f.flow_id] || 1,
        d30_recipients:   s.recipients || 0,
        d30_open_rate:    r2((s.open_rate || 0) * 100),
        d30_ctr:          r2((s.click_rate || 0) * 100),
        d30_conversions:  s.conversions || 0,
        d30_revenue:      r2(s.conversion_value || 0),
        d30_unsubscribes: s.unsubscribes || 0,
        note:             flowNote(s, attr.name || '')
      };
    });
}

async function fetchKlaviyoCampaigns() {
  // Campagnelijst ophalen voor onderwerpregel
  const listRes = await fetch(
    `${KL_BASE}/campaigns/?filter=and(equals(messages.channel,'email'),equals(status,'Sent'))` +
    `&include=campaign-messages&fields[campaign]=id,name,status,send_time` +
    `&fields[campaign-message]=definition.content.subject&sort=-scheduled_at&page[size]=20`,
    { headers: klHeaders() }
  );
  if (!listRes.ok) throw new Error(`Klaviyo campaign list ${listRes.status}: ${await listRes.text()}`);
  const listData = await listRes.json();

  // subject per campaign_id
  const subjects = {};
  for (const item of (listData.included || [])) {
    if (item.type === 'campaign-message') {
      const cid  = item.relationships?.campaign?.data?.id;
      const subj = item.attributes?.definition?.content?.subject;
      if (cid && subj) subjects[cid] = subj;
    }
  }

  await sleep(300);

  // Campagne rapport (laatste 30 dagen)
  const reportRes = await fetch(`${KL_BASE}/campaign-values-reports/`, {
    method: 'POST',
    headers: { ...klHeaders(), 'Content-Type': 'application/vnd.api+json' },
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          timeframe: { key: 'last_30_days' },
          conversion_metric_id: KL_PLACED_ORDER,
          filter: 'equals(send_channel,"email")'
        }
      }
    })
  });
  if (!reportRes.ok) throw new Error(`Klaviyo campaign report ${reportRes.status}: ${await reportRes.text()}`);
  const { data } = await reportRes.json();
  const results = data?.attributes?.results || [];

  return results.map(r => {
    const det = r.campaign_details?.attributes || {};
    const s   = r.statistics || {};
    const cid = r.groupings?.campaign_id;
    return {
      name:        cleanFlowName(det.name || ''),
      subject:     subjects[cid] || null,
      status:      (det.status || '').toLowerCase(),
      send_date:   det.send_time || null,
      segment:     det.audiences?.included?.[0]?.name || null,
      recipients:  s.recipients || 0,
      open_rate:   r2((s.open_rate || 0) * 100),
      ctr:         r2((s.click_rate || 0) * 100),
      conversions: s.conversions || 0,
      revenue:     r2(s.conversion_value || 0),
      unsubscribes: s.unsubscribes || 0,
      note:        campaignNote(s)
    };
  });
}

async function fetchKlaviyo(dateStart, dateEnd) {
  // Stap 1: MTD metrieken (sequentieel — Klaviyo rate limit)
  const received   = await klCount(KL_RECEIVED,   dateStart, dateEnd); await sleep(300);
  const opened     = await klCount(KL_OPENED,     dateStart, dateEnd); await sleep(300);
  const clicked    = await klCount(KL_CLICKED,    dateStart, dateEnd); await sleep(300);
  const subscribed = await klCount(KL_SUBSCRIBED, dateStart, dateEnd); await sleep(300);

  const openRate  = received > 0 ? r2((opened  / received) * 100) : 0;
  const clickRate = received > 0 ? r2((clicked / received) * 100) : 0;

  // Stap 2: Flows + campagnes parallel (aparte rapport-endpoints)
  const [flows, campaigns] = await Promise.all([
    fetchKlaviyoFlows().catch(err => { console.error('Klaviyo flows fout:', err.message); return null; }),
    fetchKlaviyoCampaigns().catch(err => { console.error('Klaviyo campaigns fout:', err.message); return null; })
  ]);

  return {
    list_id:             KL_LIST_ID,
    mtd_received:        received,
    mtd_opened_unique:   opened,
    mtd_clicked_unique:  clicked,
    mtd_new_subscribers: subscribed,
    open_rate_pct:       openRate,
    click_rate_pct:      clickRate,
    flows,
    campaigns
  };
}

// ── Shopify Inventory ────────────────────────────────────────────────────────
async function fetchInventory() {
  const LOC = '100691018073';
  const { inventory_levels = [] } = await shopifyFetch(
    `/inventory_levels.json?location_ids=${LOC}&limit=250`
  );
  const stock = inventory_levels.reduce((s, i) => s + (i.available || 0), 0);
  return { stock, location_id: LOC };
}

// ── main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dashboard.elunahome.nl');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Shopify is always required
  const missingShopify = ['SHOPIFY_STORE','SHOPIFY_ACCESS_TOKEN'].filter(k => !process.env[k]);
  if (missingShopify.length) {
    res.status(500).json({ error: `Ontbrekende env vars: ${missingShopify.join(', ')}` });
    return;
  }

  // Custom date range request (Shopify-only — geen Meta/Klaviyo nodig)
  const { start, end } = req.query || {};
  if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    try {
      const startMs   = new Date(start + 'T12:00:00Z').getTime();
      const endMs     = new Date(end   + 'T12:00:00Z').getTime();
      const rangeDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
      const prevEndMs   = startMs - 86400000;
      const prevStartMs = prevEndMs - (rangeDays - 1) * 86400000;
      const prevStart = new Date(prevStartMs).toISOString().slice(0, 10);
      const prevEnd   = new Date(prevEndMs).toISOString().slice(0, 10);

      const [customOrders, prevOrders] = await Promise.all([
        shopifyOrders(start, end),
        shopifyOrders(prevStart, prevEnd)
      ]);
      const agg     = aggregateOrders(customOrders);
      const prevAgg = aggregateOrders(prevOrders);

      res.status(200).json({
        custom: {
          ...agg, label: 'Aangepast', range: dateLabel(start, end),
          spend: null, gspend: null, mroas: null, groas: null, ctr: null, cpc: null,
          prev_rev: prevAgg.rev, prev_orders: prevAgg.orders,
          prev_range: dateLabel(prevStart, prevEnd)
        },
        daily_custom:      dailyBreakdown(customOrders, start, end),
        daily_prev_custom: dailyBreakdown(prevOrders,   prevStart, prevEnd)
      });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  const missing = ['META_ACCESS_TOKEN','KLAVIYO_API_KEY'].filter(k => !process.env[k]);
  if (missing.length) {
    res.status(500).json({ error: `Ontbrekende env vars: ${missing.join(', ')}` });
    return;
  }

  try {
    const [shopify, metaResult, klaviyo, inventory, googleResult] = await Promise.all([
      fetchShopify(),
      fetchMeta(),
      fetchKlaviyo(mtdStart(), amsDate(0)),
      fetchInventory().catch(() => ({ stock: null, location_id: '100691018073' })),
      fetchGoogleAds()
    ]);

    const { P, daily_mtd, daily_d7, daily_d30, daily_prev_d7, daily_prev_mtd, daily_prev_d30, _dates } = shopify;
    const { C, metaSpend } = metaResult;
    const googleData = googleResult.data;
    const GC = googleResult.GC || {};

    // Verrijk P met Meta + Google spend
    for (const k of ['today','gisteren','d7','mtd','d30']) {
      const meta = metaSpend[k] || {};
      const goog = googleData[k] || {};
      P[k].spend  = meta.spend  ?? null;
      P[k].ctr    = meta.ctr    ?? null;
      P[k].cpc    = meta.cpc    ?? null;
      P[k].gspend = goog.gspend ?? null;
      P[k].groas  = goog.groas  ?? null;
      P[k].mroas  = null; // in-platform ROAS niet betrouwbaar
    }

    const googleNote = googleResult.source === 'api'
      ? 'live · Google Ads API v21'
      : (Object.values(googleData).some(v => v.gspend !== null) ? 'handmatig · update via update-google.sh' : 'Google API niet geconfigureerd');

    const now = new Date();
    res.status(200).json({
      updated: now.toISOString(),
      updated_label: now.toLocaleDateString('nl-NL', {
        timeZone: 'Europe/Amsterdam',
        day: 'numeric', month: 'long', year: 'numeric'
      }),
      google_note: googleNote,
      P,
      C,
      GC,
      daily_mtd,
      daily_d7,
      daily_d30,
      daily_prev_d7,
      daily_prev_mtd,
      daily_prev_d30,
      klaviyo,
      inventory
    });
  } catch (err) {
    console.error('[/api/data] error:', err);
    res.status(500).json({ error: err.message });
  }
}
