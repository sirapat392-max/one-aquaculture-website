require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.OPENROUTER_API_KEY) {
  console.warn('WARNING: OPENROUTER_API_KEY not set — AI features will be unavailable');
}
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || 'missing-key',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://oneaquaculture.com',
    'X-Title': 'ONE AQUACULTURE PRODUCT',
  },
});

app.set('trust proxy', 1);
const CORS_ORIGINS = ['https://oneaquaculture.com', 'https://www.oneaquaculture.com'];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || CORS_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) cb(null, true);
    else cb(null, false);
  }
}));
app.use(express.json());

// ─── SERVER-SIDE RATE LIMIT: 10 diagnoses / IP / day ─────────────────────
const DIAG_LIMIT = 10;
const diagRateMap = new Map(); // ip → { date: 'YYYY-MM-DD', count: N }

function getDiagEntry(ip) {
  const today = new Date().toISOString().slice(0, 10);
  let e = diagRateMap.get(ip);
  if (!e || e.date !== today) { e = { date: today, count: 0 }; diagRateMap.set(ip, e); }
  return e;
}

function diagRateLimiter(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  const e = getDiagEntry(ip);
  if (e.count >= DIAG_LIMIT) {
    return res.status(429).json({
      error: `ถึงขีดจำกัด ${DIAG_LIMIT} ครั้งต่อวันแล้ว กรุณาลองใหม่พรุ่งนี้`
    });
  }
  e.count++;
  next();
}

// ─── /api/chat RATE LIMIT: 30 messages / IP / hour ───────────────────────────
const chatRateMap = new Map();

function chatRateLimiter(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  let e = chatRateMap.get(ip);
  if (!e || e.hour !== hour) { e = { hour, count: 0 }; chatRateMap.set(ip, e); }
  if (e.count >= 30) return res.status(429).json({ error: 'ถึงขีดจำกัด 30 ข้อความ/ชั่วโมงแล้ว กรุณาลองใหม่ในภายหลัง' });
  e.count++;
  next();
}

// Clean up rate-limit maps every hour
setInterval(() => {
  const today = new Date().toISOString().slice(0, 10);
  const hour = new Date().toISOString().slice(0, 13);
  for (const [ip, e] of diagRateMap) { if (e.date !== today) diagRateMap.delete(ip); }
  for (const [ip, e] of chatRateMap) { if (e.hour !== hour) chatRateMap.delete(ip); }
  for (const [ip, e] of newsRefreshRateMap) { if (e.hour !== hour) newsRefreshRateMap.delete(ip); }
}, 3600_000);

// Auto-update news daily at 06:00 UTC (13:00 Thailand time)
function scheduleDaily(hour, fn) {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const delay = next - now;
  setTimeout(() => { fn(); setInterval(fn, 864e5); }, delay);
}
scheduleDaily(23, () => {  // 23:00 UTC = 06:00 Thailand
  console.log('[AUTO] Running daily news update...');
  require('child_process').spawn('node', ['update-news.js'], {
    cwd: __dirname, stdio: 'inherit', detached: false,
  });
});

// redirect *.html → clean URL (must be before static)
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    const clean = req.path === '/index.html' ? '/' : req.path.slice(0, -5);
    return res.redirect(301, clean);
  }
  next();
});

// guides/ directory conflicts with guides.html — must be before static middleware
app.get('/guides', (req, res) => res.sendFile(path.join(__dirname, 'guides.html')));
app.get('/guides/', (req, res) => res.redirect(301, '/guides'));

// disease-map is work-in-progress — hidden from public (file kept in repo)
app.get('/disease-map', (req, res) => res.redirect(301, '/'));
app.get('/disease-map.html', (req, res) => res.redirect(301, '/'));

// serve static files; fall back to .html extension for clean URLs
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Load locked company data — AI must not deviate from this
const companyData = JSON.parse(fs.readFileSync(path.join(__dirname, 'company-data.json'), 'utf-8'));

// ─── AI SHRIMP DISEASE DIAGNOSIS ───────────────────────────────────────────
app.post('/api/diagnose', diagRateLimiter, async (req, res) => {
  const { symptoms, farmDetails, imageBase64, imageMimeType } = req.body;
  if (!symptoms && !imageBase64) return res.status(400).json({ error: 'กรุณาระบุอาการหรือแนบรูปภาพ' });

  const productList = companyData.products.map(p =>
    `- ${p.nameTH} (${p.nameEN}): ${p.description}`
  ).join('\n');

  const diseaseRef = companyData.shrimpDiseases.map(d =>
    `[${d.id}] ${d.nameTH} (${d.nameEN})
  สาเหตุ: ${d.pathogen}
  อาการ: ${d.symptoms.join(' | ')}
  เริ่มอาการ: ${d.onset}
  อายุเสี่ยง: ${d.susceptibleAge}
  น้ำที่กระตุ้น: ${d.waterTriggers}
  จุดแยกจากโรคอื่น: ${d.keyDifferential}
  ความรุนแรง: ${d.severity}`
  ).join('\n\n');

  const hasImage = !!imageBase64;
  const systemPrompt = `ผู้เชี่ยวชาญโรคกุ้ง ${companyData.company.nameTH} ตอบ JSON เท่านั้น ห้ามมี text นอก JSON

## สไตล์การเขียน (สำคัญมาก)
- ห้ามขึ้นต้นด้วย "จากข้อมูลที่ได้รับ", "ตามอาการที่กล่าวถึง", "เนื่องจาก", "ดังนั้น", "จากการวิเคราะห์" — ตัดเข้าเนื้อทันที
- reasoning: 2-3 ประโยค บอก (1) อาการหลักที่ชี้โรค (2) ทำไมตัดโรคอื่นออก — ห้ามบอกสิ่งที่ user กรอกมาซ้ำ
- immediateAction/treatment/prevention: bullet ขึ้นต้นด้วยกริยา "ลด / เพิ่ม / เปลี่ยน / ส่งตรวจ" แต่ละ bullet ≤ 10 คำ รวมไม่เกิน 3 bullet
- ห้ามพรรณา ห้ามอธิบายว่า "เพื่อ..." ต่อท้าย action — เขียนแค่ action

## กฎ
- JSON เท่านั้น ห้าม code block
- ห้ามกล่าวถึงชื่อโรงฟัก / ยี่ห้ออาหาร
- ใช้เฉพาะผลิตภัณฑ์บริษัทที่ระบุ ห้ามแต่งเพิ่ม
- needVet: true เฉพาะ severity รุนแรง/รุนแรงมาก เท่านั้น
${hasImage ? '- ระบุสิ่งที่เห็นในรูปใน reasoning (สั้นๆ)' : ''}

## สายกุ้งโตไว + ขี้ขาว
สายโตไว + WFS → severity เป็น "รุนแรง" เสมอ, reasoning ระบุ "สายโตไวฟื้นตัวยาก ส่งตรวจ PCR EHP ก่อน"

## ผลิตภัณฑ์ (โปรไบโอติก = ใช้ได้แม้ไม่รู้สาเหตุ / สารฆ่าเชื้อ = ใช้เฉพาะรู้สาเหตุแล้ว)
${productList}

## วินิจฉัย
DOC <35 → EMS ก่อน | DOC 35-70 → WFS/EHP/Vibrio | ตายเร็ว 3-10 วัน + จุดขาว → WSSV | กินดีแล้วหยุดทันที → YHD | โตช้า CV สูง → EHP | หนวดผิดรูป → IHHNV | เรืองแสง → Vibriosis | ขี้ขาว + FCR สูง → WFS
ไม่รู้สาเหตุ → ห้ามแนะนำสารฆ่าเชื้อ | ไวรัส → ไม่มียา

## ฐานข้อมูลโรค
${diseaseRef}

## JSON format
{"topDiagnosis":{"nameTH":"ชื่อโรค","nameEN":"Disease Name","confidence":85,"reasoning":"อาการ X ชี้โรคนี้ ตัดโรค Y เพราะ Z"},"differentials":[{"nameTH":"โรคหลัก","nameEN":"Main","confidence":85},{"nameTH":"โรครอง","nameEN":"Second","confidence":40},{"nameTH":"โรคที่3","nameEN":"Third","confidence":15}],"severity":"รุนแรงมาก/รุนแรง/ปานกลาง/เบา","immediateAction":"• action1\\n• action2\\n• action3","treatment":"• action1\\n• action2","prevention":"• action1\\n• action2","relevantProducts":["ชื่อผลิตภัณฑ์"],"needVet":false,"disclaimer":"ผลเบื้องต้น ควรปรึกษาผู้เชี่ยวชาญ"}`;

  const userText = `${symptoms ? `อาการที่พบ: ${symptoms}` : ''}${farmDetails ? `\nข้อมูลบ่อ:\n${farmDetails}` : ''}\n\nวิเคราะห์โรคที่เป็นไปได้และตอบในรูปแบบ JSON ที่กำหนด`;
  const userContent = imageBase64
    ? [
        { type: 'image_url', image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}` } },
        { type: 'text', text: userText },
      ]
    : userText;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await client.chat.completions.create({
      model: 'google/gemini-2.5-flash',
      max_tokens: 2048,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ไม่สามารถวิเคราะห์ได้ในขณะนี้ กรุณาลองใหม่' });
  }
});

// ─── AI GENERAL CHAT ───────────────────────────────────────────────────────
app.post('/api/chat', chatRateLimiter, async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'กรุณาระบุข้อความ' });

  const systemPrompt = `คุณคือผู้ช่วย AI ของบริษัท ${companyData.company.nameTH}
เชี่ยวชาญด้านการเพาะเลี้ยงสัตว์น้ำ โรคกุ้ง และผลิตภัณฑ์ชีวภาพ

ข้อมูลบริษัทที่ใช้ได้:
- ชื่อ: ${companyData.company.nameTH}
- อีเมล: ${companyData.company.email}
- จดทะเบียนกับ: ${companyData.company.registeredWith}

ผลิตภัณฑ์ที่มี: ${companyData.products.map(p => p.nameTH).join(', ')}

กฎ: ห้ามให้ข้อมูลบริษัทที่ไม่ได้ระบุไว้ข้างต้น ตอบเป็นภาษาไทย`;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const stream = await client.chat.completions.create({
      model: 'google/gemini-2.5-flash-lite',
      max_tokens: 1024,
      stream: true,
      messages,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
});

// ─── AI FARM CALCULATOR CHAT ───────────────────────────────────────────────
const farmChatRateMap = new Map(); // ip → { hour: 'YYYY-MM-DDTHH', count: N }

function farmChatRateLimiter(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  let e = farmChatRateMap.get(ip);
  if (!e || e.hour !== hour) { e = { hour, count: 0 }; farmChatRateMap.set(ip, e); }
  if (e.count >= 30) return res.status(429).json({ error: 'ถึงขีดจำกัด 30 ข้อความ/ชั่วโมงแล้ว กรุณาลองใหม่ในภายหลัง' });
  e.count++;
  next();
}

app.post('/api/farm-chat', farmChatRateLimiter, async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'กรุณาระบุข้อความ' });

  const FARM_SYSTEM = `คุณคือผู้ช่วยคำนวณฟาร์มกุ้งอัจฉริยะของบริษัท ONE AQUACULTURE PRODUCT
ตอบได้เฉพาะเรื่องที่เกี่ยวกับการเลี้ยงกุ้งและตัวเลขฟาร์มเท่านั้น ได้แก่:
- FCR (อัตราแลกเนื้อ) · อัตรารอด (Survival Rate)
- %BW (เปอร์เซ็นต์อาหารต่อน้ำหนักตัว) · Biomass รวมในบ่อ
- ราคาคุ้มทุน · กำไร/ขาดทุนต่อรุ่น
- ความหนาแน่น PL · คุณภาพน้ำ DO pH แอมโมเนีย
- Growth rate · การวางแผนจับ
- การตีความค่าตัวเลขว่าดี/ปานกลาง/แย่ และแนะนำวิธีปรับปรุง

กฎเหล็ก:
1. ถ้าถามเรื่องอื่นที่ไม่เกี่ยวกับการเลี้ยงกุ้งหรือตัวเลขฟาร์มให้ตอบว่า "ขออภัยครับ ผมตอบได้เฉพาะเรื่องการคำนวณฟาร์มกุ้ง ลองถามเรื่อง FCR, อัตรารอด, %BW, Biomass, หรือต้นทุนได้เลยครับ"
2. ตอบสั้น กระชับ ไม่เกิน 4-5 ประโยค
3. ถ้าผู้ใช้บอกตัวเลขมา → บอกว่าดี/ปานกลาง/ต่ำกว่ามาตรฐาน พร้อมเหตุผลสั้นๆ
4. ถ้าตัวเลขผิดปกติหรือกรอกผิด → ชี้แนะสาเหตุที่เป็นไปได้และวิธีตรวจสอบ
5. ตอบเป็นภาษาไทย ใช้ภาษาเข้าใจง่ายเหมือนคุยกับเกษตรกร
6. ห้ามตอบเรื่องโรคกุ้งในเชิงการวินิจฉัย — ให้แนะนำไปใช้ ShrimpDx แทน

ตัวอย่างค่ามาตรฐานที่รู้จัก:
- FCR ดี < 1.2 | ปกติ 1.2–1.6 | สูง > 1.6
- อัตรารอด ดี > 70% | ปกติ 50–70% | ต่ำ < 50%
- %BW กุ้งเล็ก < 1ก. = ~20% | 5–10ก. = ~7% | 15–20ก. = ~3.5% | > 20ก. = ~2.5–3%
- DO ควร > 5 mg/L | pH 7.5–8.5 | แอมโมเนีย < 0.1 mg/L`;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const messages = [
      { role: 'system', content: FARM_SYSTEM },
      ...(history || []).slice(-10).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const stream = await client.chat.completions.create({
      model: 'google/gemini-2.5-flash-lite',
      max_tokens: 512,
      stream: true,
      messages,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('farm-chat error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
});

// ─── GET COMPANY DATA (for frontend) ──────────────────────────────────────
app.get('/api/company', (req, res) => {
  res.json(companyData);
});

// ─── SHRIMP PRICE RANGE (proxy + server-side obfuscation) ────────────────────
const N8N_PRICE_URL = 'https://pricen8n-production.up.railway.app/api/prices?limit=100000&sortBy=date&oreder=asc';
let priceRangeCache = null;
let priceRangeCacheAt = 0;
const PRICE_RANGE_TTL = 10 * 60 * 1000;

function computePriceRange(records) {
  const salt = process.env.PRICE_SALT || '';
  const saltCode = salt.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  const raw = {};
  for (const r of records) {
    const dt = r.date.slice(0, 10);
    const sz = parseInt(r.size);
    if (!raw[dt]) raw[dt] = {};
    if (!raw[dt][sz]) raw[dt][sz] = { prices: [], trend: r.trend, change: r.change, latestTime: 0 };
    raw[dt][sz].prices.push(r.price);
    const t = new Date(r.createdAt).getTime();
    if (t > raw[dt][sz].latestTime) {
      raw[dt][sz].trend = r.trend;
      raw[dt][sz].change = r.change;
      raw[dt][sz].latestTime = t;
    }
  }

  // First pass: build byDate with avg stored for change calculation
  const byDate = {};
  const avgByDate = {}; // avg per date/size for change calc
  const sortedDts = Object.keys(raw).sort();

  for (const dt of sortedDts) {
    byDate[dt] = {};
    avgByDate[dt] = {};
    for (const sz of Object.keys(raw[dt])) {
      const { prices } = raw[dt][sz];
      const szInt = parseInt(sz);
      const dateNum = parseInt(dt.replace(/-/g, ''), 10) % 100000;
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      avgByDate[dt][szInt] = avg;

      let lo = Math.min(...prices);
      let hi = Math.max(...prices);

      // If all entries have the same price, apply asymmetric spread
      if (lo === hi) {
        const h1 = (szInt * 7919 + dateNum * 131 + saltCode * 17) % 9;
        const h2 = (szInt * 1301 + dateNum * 97  + saltCode * 31) % 9;
        lo = avg - (3 + h1);
        hi = avg + (2 + h2);
      }

      byDate[dt][szInt] = { min: lo, max: hi, trend: 'stable', change: 0 };
    }
  }

  // Second pass: compute change vs previous date
  for (let i = 1; i < sortedDts.length; i++) {
    const dt   = sortedDts[i];
    const prev = sortedDts[i - 1];
    for (const szInt of Object.keys(byDate[dt]).map(Number)) {
      const todayAvg = avgByDate[dt][szInt];
      const prevAvg  = avgByDate[prev]?.[szInt];
      if (prevAvg == null) continue;
      const diff = todayAvg - prevAvg;
      byDate[dt][szInt].change = diff;
      byDate[dt][szInt].trend  = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
    }
  }

  const dates = Object.keys(byDate).sort();
  return { byDate, dates };
}

const THAI_BACKUP_FILE = path.join(__dirname, 'thai-price-backup.json');

async function refreshPriceCache() {
  const r = await fetch(N8N_PRICE_URL, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const json = await r.json();
  const records = json.data || [];
  priceRangeCache = computePriceRange(records);
  priceRangeCacheAt = Date.now();
  // Backup to disk: merge new records into existing backup
  try {
    let existing = [];
    if (fs.existsSync(THAI_BACKUP_FILE)) {
      existing = JSON.parse(fs.readFileSync(THAI_BACKUP_FILE, 'utf-8')).data || [];
    }
    const seenKeys = new Set(existing.map(r => `${r.date?.slice(0,10)}_${r.size}_${r.price}`));
    let added = 0;
    for (const rec of records) {
      const k = `${rec.date?.slice(0,10)}_${rec.size}_${rec.price}`;
      if (!seenKeys.has(k)) { existing.push(rec); seenKeys.add(k); added++; }
    }
    if (added > 0) {
      existing.sort((a,b) => (a.date||'').localeCompare(b.date||''));
      const thaiContent = JSON.stringify({ updatedAt: new Date().toISOString(), data: existing });
      fs.writeFileSync(THAI_BACKUP_FILE, thaiContent);
      console.log(`✅ Thai price backup: +${added} records (total ${existing.length})`);
      // Auto-commit to GitHub weekly (only when significant new data)
      if (added >= 5) {
        commitFileToGitHub(THAI_BACKUP_FILE, thaiContent,
          `data: thai price backup +${added} records`
        ).catch(e => console.error('GitHub commit (thai) error:', e.message));
      }
    }
  } catch (e) { console.error('Thai backup error:', e.message); }
}

// Pre-warm on startup; fall back to Thai backup if N8N is down
refreshPriceCache().catch(err => {
  console.error('Price cache pre-warm failed:', err.message);
  if (fs.existsSync(THAI_BACKUP_FILE)) {
    try {
      const backup = JSON.parse(fs.readFileSync(THAI_BACKUP_FILE, 'utf-8'));
      priceRangeCache = computePriceRange(backup.data || []);
      priceRangeCacheAt = Date.now() - PRICE_RANGE_TTL; // mark stale
      console.log('⚠️  Using Thai price backup (N8N unavailable)');
    } catch {}
  }
});

app.get('/api/shrimp-price-range', async (req, res) => {
  const stale = priceRangeCache && Date.now() - priceRangeCacheAt >= PRICE_RANGE_TTL;

  // Always serve cache immediately if available (stale-while-revalidate)
  if (priceRangeCache) {
    res.json(priceRangeCache);
    if (stale) refreshPriceCache().catch(err => console.error('Price cache refresh error:', err.message));
    return;
  }

  // No cache yet (server just started and pre-warm still running) — must wait
  try {
    await refreshPriceCache();
    res.json(priceRangeCache);
  } catch (err) {
    console.error('shrimp-price-range error:', err.message);
    res.status(503).json({ error: 'ไม่สามารถโหลดข้อมูลราคาได้' });
  }
});

// ─── GET LATEST SHRIMP PRICE (for farm calculator) ────────────────────────
app.get('/api/shrimp-price', (req, res) => {
  const priceFile = path.join(__dirname, 'shrimp-price-data.json');
  if (!fs.existsSync(priceFile)) return res.json({ latest: {} });
  try {
    const data = JSON.parse(fs.readFileSync(priceFile, 'utf-8'));
    const records = Array.isArray(data) ? data : (data.records || []);
    const latest = {};
    for (const r of records) {
      const sz = parseInt(r.size);
      if (!latest[sz] || new Date(r.date) >= new Date(latest[sz].date)) {
        latest[sz] = r.price;
      }
    }
    res.json({ latest });
  } catch { res.json({ latest: {} }); }
});

// ─── WORLD SHRIMP PRICE (Shrimp Insights) ────────────────────────────────
const WORLD_PRICE_FILE   = path.join(__dirname, 'world-price-cache.json');
const WORLD_HISTORY_FILE = path.join(__dirname, 'world-price-history.json');
const WORLD_PRICE_TTL    = 24 * 3600_000; // re-check daily (SI publishes weekly)
let worldPriceCache = null;
let worldPriceCacheAt = 0;

const WORLD_COUNTRIES = { ec:'Ecuador', in:'India', id:'Indonesia', th:'Thailand', vn:'Vietnam' };
const WORLD_CURR      = { ec:'USD', in:'INR', id:'IDR', th:'THB', vn:'VND' };
const WORLD_FLAGS     = { ec:'🇪🇨', in:'🇮🇳', id:'🇮🇩', th:'🇹🇭', vn:'🇻🇳' };

// ─── AUTO-COMMIT TO GITHUB VIA API ───────────────────────────────────────────
const GH_REPO = 'sirapat392-max/one-aquaculture-website';
const GH_API  = 'https://api.github.com';

async function commitFileToGitHub(filePath, content, message) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return; // silently skip if no token configured

  const fileName = path.basename(filePath);
  const apiPath  = `/repos/${GH_REPO}/contents/${fileName}`;
  const encoded  = Buffer.from(content).toString('base64');

  // Get current SHA (needed to update existing file)
  const getRes = await fetch(`${GH_API}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ONE-Aquaculture-Server' }
  });
  const current = getRes.ok ? await getRes.json() : null;
  const sha = current?.sha;

  const body = { message, content: encoded, ...(sha ? { sha } : {}) };
  const putRes = await fetch(`${GH_API}${apiPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ONE-Aquaculture-Server',
    },
    body: JSON.stringify(body),
  });

  if (putRes.ok) {
    console.log(`✅ GitHub auto-commit: ${fileName}`);
  } else {
    const err = await putRes.text();
    console.error(`❌ GitHub commit failed (${putRes.status}): ${err.slice(0, 200)}`);
  }
}

// Load history records from disk (persists across restarts; base from git)
function loadHistoryRecords() {
  if (!fs.existsSync(WORLD_HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(WORLD_HISTORY_FILE, 'utf-8')).records || []; } catch { return []; }
}

function mergeAndSaveHistory(incoming) {
  const existing = loadHistoryRecords();
  const seen = new Set(existing.map(r => `${r.c}_${r.sz}_${r.wk}_${r.yr}`));
  let added = 0;
  for (const r of incoming) {
    const k = `${r.c}_${r.sz}_${r.wk}_${r.yr}`;
    if (!seen.has(k)) { existing.push(r); seen.add(k); added++; }
  }
  if (added > 0) {
    existing.sort((a, b) => a.yr !== b.yr ? a.yr - b.yr : a.wk !== b.wk ? a.wk - b.wk : a.c.localeCompare(b.c));
    const content = JSON.stringify({ updatedAt: new Date().toISOString(), records: existing }, null, 2);
    fs.writeFileSync(WORLD_HISTORY_FILE, content);
    console.log(`✅ World price history: +${added} new records (total ${existing.length})`);
    // Auto-commit to GitHub so data survives Railway redeploys
    const latestWk = existing[existing.length-1];
    commitFileToGitHub(WORLD_HISTORY_FILE, content,
      `data: world price history +${added} records (W${latestWk?.wk}/${latestWk?.yr})`
    ).catch(e => console.error('GitHub commit error:', e.message));
  }
  return existing;
}

function buildWorldResponse(allRecords, fetchedAt) {
  // Latest per (country, size)
  const latestMap = {};
  for (const r of allRecords) {
    const k = `${r.c}_${r.sz}`;
    const cur = latestMap[k];
    if (!cur || r.yr > cur.yr || (r.yr === cur.yr && r.wk > cur.wk)) latestMap[k] = r;
  }
  const countries = {};
  for (const r of Object.values(latestMap)) {
    if (!countries[r.c]) countries[r.c] = { name: WORLD_COUNTRIES[r.c]||r.c, flag: WORLD_FLAGS[r.c]||'', currency: WORLD_CURR[r.c]||'USD', sizes: {} };
    countries[r.c].sizes[r.sz] = { usd: r.usd, local: r.local, week: r.wk, year: r.yr };
  }
  // History series per country/size for charts
  const history = {};
  for (const r of allRecords) {
    if (!r.usd) continue;
    const sz = String(r.sz);
    if (!history[r.c]) history[r.c] = {};
    if (!history[r.c][sz]) history[r.c][sz] = [];
    history[r.c][sz].push({ week: r.wk, year: r.yr, usd: r.usd });
  }
  for (const c of Object.keys(history))
    for (const sz of Object.keys(history[c]))
      history[c][sz].sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week);

  return { countries, history, fetchedAt };
}

// Load cache on startup (build from history file if available)
(() => {
  const cached = fs.existsSync(WORLD_PRICE_FILE)
    ? (() => { try { return JSON.parse(fs.readFileSync(WORLD_PRICE_FILE,'utf-8')); } catch { return null; } })()
    : null;
  if (cached && Date.now() - cached.fetchedAt < WORLD_PRICE_TTL) {
    worldPriceCache = cached; worldPriceCacheAt = cached.fetchedAt; return;
  }
  // Build from history file (always available after first deploy)
  const records = loadHistoryRecords();
  if (records.length) {
    worldPriceCache = buildWorldResponse(records, Date.now());
    worldPriceCacheAt = Date.now() - WORLD_PRICE_TTL; // mark as stale so it refreshes soon
  }
})();

async function fetchWorldPrice() {
  const https = require('https');
  const params = [
    'f%5B0%5D=species%3Avannamei',
    'f%5B1%5D=country%3Aid','f%5B2%5D=country%3Ain',
    'f%5B3%5D=country%3Avn','f%5B4%5D=country%3Aec','f%5B5%5D=country%3Ath',
    'f%5B6%5D=size%3A30','f%5B7%5D=size%3A60','f%5B8%5D=size%3A100',
  ].join('&');
  const url = `https://www.shrimpinsights.com/price-portal?${params}`;

  const html = await new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, res => { let b=''; res.on('data', c=>b+=c); res.on('end', ()=>resolve(b)); });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });

  const m = html.match(/data-prices="([^"]+)"/);
  if (!m) throw new Error('data-prices not found in Shrimp Insights page');
  const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const incoming = JSON.parse(raw)
    .filter(r => r.farm_gate_price_price_usd)
    .map(r => ({
      c: r.field_country, sp: r.field_species, sz: r.farm_gate_price_size,
      usd: r.farm_gate_price_price_usd, local: r.farm_gate_price_price_local,
      wk: r.farm_gate_price_weeknumber, yr: r.farm_gate_price_year,
    }));

  // Merge into persistent history file
  const allRecords = mergeAndSaveHistory(incoming);

  const data = buildWorldResponse(allRecords, Date.now());
  fs.writeFileSync(WORLD_PRICE_FILE, JSON.stringify(data));
  worldPriceCache = data;
  worldPriceCacheAt = data.fetchedAt;
  return data;
}

app.get('/api/world-shrimp-price', async (req, res) => {
  if (worldPriceCache && Date.now() - worldPriceCacheAt < WORLD_PRICE_TTL) {
    return res.json(worldPriceCache);
  }
  try {
    const data = await fetchWorldPrice();
    res.json(data);
  } catch (err) {
    console.error('world-shrimp-price error:', err.message);
    if (worldPriceCache) return res.json(worldPriceCache); // serve stale on error
    res.status(503).json({ error: 'ไม่สามารถโหลดข้อมูลราคาโลกได้' });
  }
});

// ─── GET CURRENT NEWS ─────────────────────────────────────────────────────
// Shrimp-only keywords for API-level filtering
const SHRIMP_KW = [
  'shrimp','prawn','vannamei','penaeus','monodon','กุ้ง','tôm','udang','camarón',
  'エビ','새우','চিংড়ি','రొయ్యలు','இறால்','झींगा','hipon','กุ้งขาว','กุ้งกุลา',
  'ems','wssv','ehp','ahpnd','wfs','ihhnv','yhd','white spot','vibrio',
  'shrimp export','shrimp import','shrimp tariff','shrimp trade','shrimp price',
  'shrimp market','shrimp ban','camarão','虾','ส่งออกกุ้ง','ราคากุ้ง',
  'xuất khẩu tôm','giá tôm','ekspor udang','harga udang',
];

function isShrimpArticle(a) {
  const text = `${a.title || ''} ${a.titleTH || ''} ${a.summary || ''}`.toLowerCase();
  return SHRIMP_KW.some(kw => text.includes(kw.toLowerCase()));
}

app.get('/api/news', (req, res) => {
  const newsFile = path.join(__dirname, 'news-data.json');
  if (!fs.existsSync(newsFile)) return res.json({ articles: [], lastUpdated: null });
  const data = JSON.parse(fs.readFileSync(newsFile, 'utf-8'));
  data.articles = (data.articles || []).filter(a => !a.isSample && isShrimpArticle(a));
  res.json(data);
});

// ─── RSS FETCH + AI TRANSLATE NEWS ───────────────────────────────────────
function _parseRSSUnused() {
}

function catLabel(cat) {
  return { industry:'🌏 อุตสาหกรรม', regulation:'📋 กฎระเบียบ', research:'🔬 งานวิจัย', disease:'🦠 โรคสัตว์น้ำ' }[cat] || '🌏 อุตสาหกรรม';
}

const newsRefreshRateMap = new Map();

function newsRefreshRateLimiter(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  let e = newsRefreshRateMap.get(ip);
  if (!e || e.hour !== hour) { e = { hour, count: 0 }; newsRefreshRateMap.set(ip, e); }
  if (e.count >= 2) return res.status(429).json({ error: 'รีเฟรชข่าวได้สูงสุด 2 ครั้ง/ชั่วโมง' });
  e.count++;
  next();
}

let newsRefreshLock = false;
app.post('/api/refresh-news', newsRefreshRateLimiter, async (req, res) => {
  if (newsRefreshLock) return res.status(429).json({ error: 'กำลังอัปเดตอยู่ รอสักครู่' });
  newsRefreshLock = true;
  try {
    // Delegate entirely to update-news.js (same logic used by daily cron)
    await new Promise((resolve, reject) => {
      const child = require('child_process').spawn('node', ['update-news.js'], {
        cwd: __dirname, stdio: 'inherit',
      });
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
      child.on('error', reject);
      // Timeout after 3 minutes
      setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 180_000);
    });

    const newsFile = path.join(__dirname, 'news-data.json');
    const payload = JSON.parse(fs.readFileSync(newsFile, 'utf-8'));
    res.json(payload);
  } catch (err) {
    console.error('refresh-news error:', err.message);
    res.status(500).json({ error: 'อัปเดตข่าวไม่สำเร็จ: ' + err.message });
  } finally {
    newsRefreshLock = false;
  }
});

// On startup: run update-news.js if no news file or older than 1 day
setTimeout(() => {
  const newsFile = path.join(__dirname, 'news-data.json');
  try {
    const data = fs.existsSync(newsFile) ? JSON.parse(fs.readFileSync(newsFile, 'utf-8')) : {};
    const ageMs = data.lastUpdated ? Date.now() - new Date(data.lastUpdated) : Infinity;
    if (ageMs > 24 * 3600_000) {
      console.log('[news] Stale/missing news-data.json — running update-news.js on startup');
      require('child_process').spawn('node', ['update-news.js'], { cwd: __dirname, stdio: 'inherit' });
    }
  } catch {}
}, 5_000);

// ─── CONTACT FORM EMAIL ───────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, company, phone, email, product, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อ อีเมล และข้อความ' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const htmlBody = `
    <div style="font-family: 'Sarabun', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0d6c8; border-radius: 10px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #8B3060, #C9956C); padding: 28px 32px;">
        <h2 style="color: white; margin: 0; font-size: 20px;">📬 ข้อความใหม่จากแบบฟอร์มติดต่อ</h2>
        <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">ONE Aquaculture Product — Contact Form Submission</p>
      </div>
      <div style="padding: 28px 32px; background: #fafaf8;">
        <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
          <tr>
            <td style="padding: 10px 0; color: #888; width: 140px; vertical-align: top;">ชื่อ-นามสกุล</td>
            <td style="padding: 10px 0; color: #2c2c2c; font-weight: 600;">${name}</td>
          </tr>
          ${company ? `<tr>
            <td style="padding: 10px 0; color: #888; vertical-align: top;">บริษัท / ฟาร์ม</td>
            <td style="padding: 10px 0; color: #2c2c2c;">${company}</td>
          </tr>` : ''}
          ${phone ? `<tr>
            <td style="padding: 10px 0; color: #888; vertical-align: top;">โทรศัพท์</td>
            <td style="padding: 10px 0; color: #2c2c2c;">${phone}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px 0; color: #888; vertical-align: top;">อีเมล</td>
            <td style="padding: 10px 0; color: #2c2c2c;"><a href="mailto:${email}" style="color: #8B3060;">${email}</a></td>
          </tr>
          ${product ? `<tr>
            <td style="padding: 10px 0; color: #888; vertical-align: top;">ผลิตภัณฑ์ที่สนใจ</td>
            <td style="padding: 10px 0; color: #2c2c2c;">${product}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px 0; color: #888; vertical-align: top;">ข้อความ</td>
            <td style="padding: 10px 0; color: #2c2c2c; white-space: pre-line;">${message}</td>
          </tr>
        </table>
      </div>
      <div style="padding: 16px 32px; background: #f0ece6; font-size: 12px; color: #aaa; text-align: center;">
        ส่งจากเว็บไซต์ ONE Aquaculture Product · one-aquaculture.com
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: 'one.aquaculture.product@gmail.com',
      replyTo: email,
      subject: `[ONE Aquaculture] ข้อความจาก ${name} – ${product || 'ทั่วไป'}`,
      html: htmlBody,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'ส่งไม่สำเร็จ' });
  }
});

// ─── CASE DATABASE ────────────────────────────────────────────────────────────
const CASES_FILE = path.join(__dirname, 'cases.json');
function readCases() {
  try { return JSON.parse(fs.readFileSync(CASES_FILE, 'utf-8')); }
  catch { return []; }
}
function writeCases(cases) {
  fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2), 'utf-8');
}

app.post('/api/save-case', (req, res) => {
  const { symptoms, farmDetails, aiDiagnosis, aiRaw } = req.body;
  if (!farmDetails && !symptoms) return res.status(400).json({ error: 'ไม่มีข้อมูล' });
  const cases = readCases();
  const newCase = {
    id: `case-${Date.now()}`,
    timestamp: new Date().toISOString(),
    symptoms: symptoms || '',
    farmDetails: farmDetails || '',
    aiDiagnosis: aiDiagnosis || null,
    aiRaw: aiRaw || '',
    status: 'pending',
    vetNotes: '',
    vetDiagnosis: '',
    vetTimestamp: null,
  };
  cases.unshift(newCase);
  writeCases(cases);
  res.json({ ok: true, id: newCase.id });
});

const VET_PASS = process.env.VET_PASSWORD || null;
if (!VET_PASS) console.warn('WARNING: VET_PASSWORD env var not set — vet portal is disabled');

app.get('/api/cases', (req, res) => {
  if (!VET_PASS || req.query.pass !== VET_PASS) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  res.json(readCases());
});

app.patch('/api/cases/:id', (req, res) => {
  if (!VET_PASS || req.query.pass !== VET_PASS) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  const cases = readCases();
  const idx = cases.findIndex(c => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'ไม่พบเคส' });
  const { vetNotes, vetDiagnosis, vetSeverity, vetDrugs, vetTreatment, status } = req.body;
  cases[idx] = { ...cases[idx], vetNotes, vetDiagnosis, vetSeverity, vetDrugs, vetTreatment, status, vetTimestamp: new Date().toISOString() };
  writeCases(cases);
  res.json({ ok: true });
});

// ─── GLOBAL SHRIMP DISEASE MAP API ────────────────────────────────────────
const DISEASE_COUNTRIES = [
  // Americas
  { id: 'ecuador',     name: 'เอกวาดอร์',      nameEn: 'Ecuador',     flag: '🇪🇨', row: 'americas',
    keywords: ['ecuador', 'เอกวาดอร์', 'camaroneros', 'cna.gov.ec'] },
  { id: 'brazil',      name: 'บราซิล',           nameEn: 'Brazil',      flag: '🇧🇷', row: 'americas',
    keywords: ['brazil', 'บราซิล', 'brazilian', 'brasil', 'camarão'] },
  { id: 'usa',         name: 'สหรัฐอเมริกา',    nameEn: 'USA',         flag: '🇺🇸', row: 'americas',
    keywords: ['usa', 'united states', 'u.s.', 'american', 'สหรัฐ'] },
  // South / Southeast Asia
  { id: 'india',       name: 'อินเดีย',          nameEn: 'India',       flag: '🇮🇳', row: 'sea',
    keywords: ['india', 'indian', 'อินเดีย', 'andhra', 'odisha', 'gujarat', 'mpeda',
               'रొయ్యలు', 'இறால்', 'झींगा', 'vannamei india', 'andhra pradesh', 'telangana'] },
  { id: 'bangladesh',  name: 'บังกลาเทศ',        nameEn: 'Bangladesh',  flag: '🇧🇩', row: 'sea',
    keywords: ['bangladesh', 'bangladeshi', 'บังกลาเทศ', 'চিংড়ি', 'বাংলাদেশ', 'khulna', 'satkhira', 'cox\'s bazar'] },
  { id: 'myanmar',     name: 'เมียนมา',          nameEn: 'Myanmar',     flag: '🇲🇲', row: 'sea',
    keywords: ['myanmar', 'burma', 'burmese', 'เมียนมา', 'ပုဇွန်', 'မြန်မာ', 'yangon', 'ayeyarwady'] },
  { id: 'thailand',    name: 'ไทย',              nameEn: 'Thailand',    flag: '🇹🇭', row: 'sea',
    keywords: ['thailand', 'thai', 'ไทย', 'กุ้ง', 'สุราษฎร์', 'สงขลา', 'ชุมพร', 'ระยอง', 'นครศรีธรรมราช'] },
  { id: 'vietnam',     name: 'เวียดนาม',         nameEn: 'Vietnam',     flag: '🇻🇳', row: 'sea',
    keywords: ['vietnam', 'viet', 'vietnamese', 'เวียดนาม', 'việt nam', 'vasep', 'cà mau', 'bạc liêu', 'sóc trăng'] },
  { id: 'malaysia',    name: 'มาเลเซีย',         nameEn: 'Malaysia',    flag: '🇲🇾', row: 'sea',
    keywords: ['malaysia', 'malaysian', 'มาเลเซีย', 'malaysia', 'sarawak', 'sabah', 'aquakultur', 'perikanan malaysia'] },
  { id: 'philippines', name: 'ฟิลิปปินส์',       nameEn: 'Philippines', flag: '🇵🇭', row: 'sea',
    keywords: ['philippines', 'philippine', 'filipino', 'ฟิลิปปินส์', 'hipon', 'pilipinas', 'bfar', 'palawan', 'mindanao'] },
  { id: 'indonesia',   name: 'อินโดนีเซีย',      nameEn: 'Indonesia',   flag: '🇮🇩', row: 'sea',
    keywords: ['indonesia', 'indonesian', 'อินโดนีเซีย', 'kkp', 'jawa', 'sulawesi', 'kalimantan', 'sumatera'] },
  // East Asia / Pacific
  { id: 'china',       name: 'จีน',              nameEn: 'China',       flag: '🇨🇳', row: 'east',
    keywords: ['china', 'chinese', 'จีน', '中国', '虾', '对虾', 'guangdong', '广东', 'guangxi'] },
  { id: 'japan',       name: 'ญี่ปุ่น',           nameEn: 'Japan',       flag: '🇯🇵', row: 'east',
    keywords: ['japan', 'japanese', 'ญี่ปุ่น', 'エビ', '養殖', '水産庁', 'kuruma', 'ebi'] },
  { id: 'south_korea', name: 'เกาหลีใต้',        nameEn: 'South Korea', flag: '🇰🇷', row: 'east',
    keywords: ['korea', 'korean', 'เกาหลี', '새우', '양식', 'nifs', 'mof korea'] },
  { id: 'australia',   name: 'ออสเตรเลีย',       nameEn: 'Australia',   flag: '🇦🇺', row: 'east',
    keywords: ['australia', 'australian', 'ออสเตรเลีย', 'frdc', 'apfa', 'prawn australia', 'queensland prawn'] },
];

const DISEASE_KW = ['EHP','WSSV','White Spot','white spot','WFS','Vibrio','EMS','AHPND','IHHNV','YHD',
  'outbreak','mortality','ตายด่วน','ขี้ขาว','โรคกุ้ง','ระบาด','white feces','early mortality',
  'hepatopancreatic','microsporidian'];

// Representative sample articles — used when real disease news is sparse (< 5 articles).
// Based on well-documented historical outbreaks; clearly flagged as isSample.
const SAMPLE_ARTICLES = [
  {
    title: 'EHP continues to challenge shrimp farms across Vietnam — biosecurity key to control',
    titleTH: 'EHP ยังคงส่งผลกระทบฟาร์มกุ้งทั่วเวียดนาม — สุขอนามัยชีวภาพเป็นกุญแจควบคุม',
    source: 'GAA Advocate', url: 'https://www.globalseafood.org/advocate/',
    date: '2026-06-01', category: 'disease', categoryLabel: '🦠 โรคสัตว์น้ำ',
    summary: 'EHP (Enterocytozoon hepatopenaei) ยังคงเป็นปัญหาสำคัญในฟาร์มกุ้งเวียดนาม ส่งผลให้การเจริญเติบโตช้าและ FCR สูงขึ้น เกษตรกรต้องเสริมมาตรการสุขอนามัยชีวภาพ', isSample: true,
  },
  {
    title: 'India shrimp sector battles recurring WSSV in Andhra Pradesh coastal ponds',
    titleTH: 'กุ้งอินเดียสู้กับการกลับมาของ WSSV ในบ่อชายฝั่งรัฐอานธรประเทศ',
    source: 'Undercurrent News', url: 'https://www.undercurrentnews.com/',
    date: '2026-05-28', category: 'disease', categoryLabel: '🦠 โรคสัตว์น้ำ',
    summary: 'WSSV กลับมาระบาดในพื้นที่เพาะเลี้ยงกุ้งสำคัญของรัฐอานธรประเทศ อินเดีย กระทบผลผลิตและทำให้เกษตรกรบางส่วนต้องปล่อยน้ำออกจากบ่อก่อนกำหนด', isSample: true,
  },
  {
    title: 'Ecuador white spot disease impacts Pacific shrimp production — export volumes at risk',
    titleTH: 'WSSV กระทบการผลิตกุ้งแปซิฟิกในเอกวาดอร์ — ปริมาณส่งออกเสี่ยงลดลง',
    source: 'Hatchery International', url: 'https://www.hatcheryinternational.com/',
    date: '2026-06-10', category: 'disease', categoryLabel: '🦠 โรคสัตว์น้ำ',
    summary: 'WSSV ระบาดในฟาร์มกุ้งเอกวาดอร์ซึ่งเป็นผู้ส่งออกกุ้งรายใหญ่ของโลก อาจส่งผลต่อปริมาณการส่งออกในไตรมาสนี้และราคาตลาดโลก', isSample: true,
  },
  {
    title: 'Indonesia detects IHHNV in vannamei hatcheries across Java and Sumatra',
    titleTH: 'อินโดนีเซียพบ IHHNV ในโรงเพาะฟักกุ้งวาแนไมในชวาและสุมาตรา',
    source: 'GAA Advocate', url: 'https://www.globalseafood.org/advocate/',
    date: '2026-05-20', category: 'disease', categoryLabel: '🦠 โรคสัตว์น้ำ',
    summary: 'IHHNV ถูกตรวจพบในโรงเพาะฟักกุ้งหลายแห่งในอินโดนีเซีย กรมประมงออกคำเตือนให้เพิ่มมาตรการตรวจคัดกรองและกักกันสัตว์น้ำ', isSample: true,
  },
  {
    title: 'Bangladesh shrimp farms report EMS (AHPND) in southwest coastal cultivation areas',
    titleTH: 'ฟาร์มกุ้งบังกลาเทศรายงาน EMS/AHPND ในพื้นที่เพาะเลี้ยงชายฝั่งตะวันตกเฉียงใต้',
    source: 'Aquaculture North America', url: 'https://www.aquaculturenorthamerica.com/',
    date: '2026-06-15', category: 'disease', categoryLabel: '🦠 โรคสัตว์น้ำ',
    summary: 'EMS (AHPND) ถูกรายงานในพื้นที่เพาะเลี้ยงกุ้งชายฝั่งตะวันตกเฉียงใต้ของบังกลาเทศ กุ้งตายในช่วง 20-30 วันแรกหลังปล่อยลงบ่อ', isSample: true,
  },
  {
    title: 'Thailand EHP and white feces syndrome remain major challenges for commercial vannamei farms',
    titleTH: 'EHP และโรคขี้ขาวยังคงเป็นความท้าทายหลักสำหรับฟาร์มกุ้งวาแนไมเชิงพาณิชย์ไทย',
    source: 'Hatchery International', url: 'https://www.hatcheryinternational.com/',
    date: '2026-06-05', category: 'disease', categoryLabel: '🦠 โรคสัตว์น้ำ',
    summary: 'EHP และ WFS ยังคงเป็นปัญหาหลักในฟาร์มกุ้งวาแนไมของไทย โดยเฉพาะช่วงอุณหภูมิน้ำสูง กระทบ FCR และอัตรารอด', isSample: true,
  },
  {
    title: 'China Vibrio outbreak strains shrimp production at Guangdong coastal farms this summer',
    titleTH: 'Vibrio ระบาดในฟาร์มกุ้งชายฝั่งกวางตุ้ง จีน ในช่วงฤดูร้อน',
    source: 'Undercurrent News', url: 'https://www.undercurrentnews.com/',
    date: '2026-05-25', category: 'disease', categoryLabel: '🦠 โรคสัตว์น้ำ',
    summary: 'เชื้อ Vibrio harveyi และ V. parahaemolyticus ก่อให้เกิดความสูญเสียในฟาร์มกุ้งชายฝั่งมณฑลกวางตุ้ง ประเทศจีน เกษตรกรเร่งเพิ่มโปรไบโอติกส์และลดความหนาแน่น', isSample: true,
  },
];

app.get('/api/disease-map', (req, res) => {
  try {
    const newsFile = path.join(__dirname, 'news-data.json');
    const newsData = fs.existsSync(newsFile)
      ? JSON.parse(fs.readFileSync(newsFile, 'utf-8'))
      : { articles: [], lastUpdated: null };

    // Collect real disease articles (by category or disease keywords)
    const realDiseaseArticles = (newsData.articles || []).filter(a => {
      if (a.category === 'disease') return true;
      const text = `${a.title} ${a.titleTH || ''} ${a.summary || ''}`.toLowerCase();
      return DISEASE_KW.some(kw => text.includes(kw.toLowerCase()));
    });

    // Supplement with representative sample data when real data is sparse
    const usingSampleData = realDiseaseArticles.length < 5;
    const allDiseaseArticles = usingSampleData
      ? [...realDiseaseArticles, ...SAMPLE_ARTICLES]
      : realDiseaseArticles;

    // 45-day cutoff for risk calculation (matches decay window)
    const cutoff = new Date(Date.now() - 45 * 24 * 3600_000).toISOString().slice(0, 10);

    // Build per-country data
    const countries = DISEASE_COUNTRIES.map(country => {
      const matchedReal = [];   // real articles only — used for risk scoring
      const matchedAll  = [];   // real + sample — used for disease-type tags
      const diseasesFound = new Set();

      for (const article of allDiseaseArticles) {
        const text = `${article.title} ${article.titleTH || ''} ${article.summary || ''}`;
        const textLower = text.toLowerCase();

        // Match by AI-extracted country field OR keyword scan
        const aiCountryMatch = article.country && country.keywords.some(kw =>
          article.country.toLowerCase().includes(kw.toLowerCase())
        );
        const keywordMatch = country.keywords.some(kw => textLower.includes(kw.toLowerCase()));
        if (!aiCountryMatch && !keywordMatch) continue;

        matchedAll.push(article);
        if (!article.isSample) {
          matchedReal.push(article);
          // Disease tags only from real articles
          DISEASE_KW.filter(kw => textLower.includes(kw.toLowerCase()))
            .forEach(kw => diseasesFound.add(kw));
        }
      }

      // Decay model uses REAL articles only (sample articles have fixed old dates and would decay)
      const realDates = matchedReal.map(a => a.date).filter(Boolean).sort();
      const latestDate = realDates[realDates.length - 1] || null;
      const daysSinceLatest = latestDate
        ? Math.floor((Date.now() - new Date(latestDate)) / 864e5)
        : null;
      const recent30 = matchedReal.filter(a => (a.date || '9999') >= cutoff);
      const count = recent30.length;
      // Decay: HIGH→MEDIUM after 7d, MEDIUM→LOW after 21d, LOW→NONE after 45d
      let riskLevel;
      if (count >= 3 && daysSinceLatest <= 7)        riskLevel = 'high';
      else if (count >= 1 && daysSinceLatest <= 21)  riskLevel = 'medium';
      else if (count >= 1 && daysSinceLatest <= 45)  riskLevel = 'low';
      else                                             riskLevel = 'none';

      const matched = matchedAll; // keep for article card display below

      return {
        id: country.id,
        name: country.name,
        nameEn: country.nameEn,
        flag: country.flag,
        daysSinceLatest: latestDate ? daysSinceLatest : null,
        latestDate,
        row: country.row,
        riskLevel,
        diseaseCount: count,
        diseases: [...diseasesFound].slice(0, 5),
        latestDate,
        articles: matched.slice(0, 3).map(a => ({
          title: a.titleTH || a.title,
          // Only expose URL if it's a real article (not sample placeholder)
          url: a.isSample ? null : a.url,
          date: a.date,
          isSample: a.isSample || false,
        })),
      };
    });

    // Global stats
    const countriesWithAlerts = countries.filter(c => c.riskLevel !== 'none').length;
    const totalDiseaseArticles = realDiseaseArticles.filter(a => (a.date || '9999') >= cutoff).length;
    const diseaseCounts = {};
    for (const c of countries) {
      for (const d of c.diseases) diseaseCounts[d] = (diseaseCounts[d] || 0) + 1;
    }
    const topDisease = Object.entries(diseaseCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    res.json({
      countries,
      // Only expose real articles (with real URLs) in the news feed
    articles: allDiseaseArticles.filter(a => !a.isSample && a.url),
      lastUpdated: newsData.lastUpdated,
      usingSampleData,
      stats: { countriesWithAlerts, totalDiseaseArticles, topDisease },
    });
  } catch (err) {
    console.error('disease-map error:', err.message);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลแผนที่โรคได้' });
  }
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, () => {
  console.log(`✅ ONE Aquaculture server running at http://localhost:${PORT}`);
  console.log(`🤖 AI Diagnosis: http://localhost:${PORT}/ai-diagnosis.html`);
  console.log(`📰 Run 'npm run update-news' to refresh news`);
});
