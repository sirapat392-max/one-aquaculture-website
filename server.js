require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://one-aquaculture.onrender.com',
    'X-Title': 'ONE AQUACULTURE PRODUCT',
  },
});

app.set('trust proxy', 1); // Render.com reverse proxy
app.use(cors());
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

// Clean up entries older than today every hour (prevent memory leak)
setInterval(() => {
  const today = new Date().toISOString().slice(0, 10);
  for (const [ip, e] of diagRateMap) { if (e.date !== today) diagRateMap.delete(ip); }
}, 3600_000);

// redirect *.html → clean URL (must be before static)
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    const clean = req.path === '/index.html' ? '/' : req.path.slice(0, -5);
    return res.redirect(301, clean);
  }
  next();
});

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
  const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านโรคกุ้งของบริษัท ${companyData.company.nameTH} ที่มีประสบการณ์หน้าฟาร์มมากกว่า 10 ปี

## กฎเหล็ก
1. ตอบเป็น JSON ล้วนๆ เท่านั้น — ห้ามมี text นอก JSON ห้ามใส่ \`\`\`json หรือ code block ใดๆ
2. reasoning ไม่เกิน 2 ประโยค, immediateAction/treatment/prevention ไม่เกิน 2 ประโยค
3. ห้ามกล่าวถึงชื่อโรงฟักหรือยี่ห้ออาหารสัตว์
4. ใช้เฉพาะผลิตภัณฑ์บริษัทที่ระบุไว้ ห้ามแต่งเพิ่ม
5. ห้ามรับประกันผลการรักษา
${hasImage ? '6. ใช้ข้อมูลจากรูปภาพประกอบการวินิจฉัยด้วย — สังเกตสี รูปร่าง ความผิดปกติที่มองเห็น' : ''}

## กฎ needVet (สำคัญมาก — ห้ามตั้งเป็น true ทุกเคส)
- needVet: true เฉพาะ severity = "รุนแรงมาก" หรือ "รุนแรง" เท่านั้น
- needVet: false สำหรับ severity = "ปานกลาง" หรือ "เบา"

## กฎการรักษาตามสาเหตุ
- สาเหตุคือ**คุณภาพน้ำ** (เช่น DO ต่ำ, pH ผิด, ก๊าซแอมโมเนีย, ความเค็มผิด): treatment/immediateAction ต้องโฟกัสการแก้น้ำ เช่น เพิ่มออกซิเจน เปลี่ยนน้ำ ปรับ pH ลดปริมาณอาหาร — ห้ามแนะนำยาหรือชีวภัณฑ์เป็นอันดับแรก
- สาเหตุคือ**เชื้อไวรัส** (WSSV, YHD): ไม่มียารักษา treatment = กำจัดกุ้งป่วย ทำความสะอาดบ่อ ป้องกันแพร่กระจาย
- สาเหตุคือ**แบคทีเรีย/เชื้อรา**: ใช้ผลิตภัณฑ์ชีวภัณฑ์ของบริษัทได้
- สาเหตุคือ**ปรสิต/EHP**: โฟกัสการจัดการบ่อและสุขอนามัย

## กลยุทธ์วินิจฉัย (สำคัญ)
- ดู DOC: ตาย <35 วัน → EMS ก่อนเป็นอันดับแรก; ตาย >50 วัน → WSSV/WFS/EHP เป็นไปได้มากกว่า
- ดูจุดแยกโรค (keyDifferential) ของแต่ละโรคอย่างละเอียด
- พิจารณาอาการรวมกัน ไม่ใช่อาการเดียว
- ถ้าตาย 3–10 วันเร็วมาก → WSSV หรือ YHD ก่อน
- ถ้าโตช้า CV สูง ไม่ตาย → EHP ก่อน
- ถ้ากุ้งเรืองแสงในที่มืด → Vibriosis ชัดเจน
- ถ้าหนวดผิดรูป ตัวเตี้ย → IHHNV

## ผลิตภัณฑ์บริษัท
${productList}

## ฐานข้อมูลโรคกุ้ง (${companyData.shrimpDiseases.length} โรค)
${diseaseRef}

## รูปแบบ JSON (ตอบแบบนี้เท่านั้น ไม่มีอะไรนอก JSON)
{"topDiagnosis":{"nameTH":"ชื่อโรค","nameEN":"Disease Name","confidence":85,"reasoning":"เหตุผล 1-2 ประโยค อ้างอิง keyDifferential"},"differentials":[{"nameTH":"โรคหลัก","nameEN":"Main","confidence":85},{"nameTH":"โรครอง","nameEN":"Second","confidence":40},{"nameTH":"โรคที่3","nameEN":"Third","confidence":15}],"severity":"รุนแรงมาก/รุนแรง/ปานกลาง/เบา","immediateAction":"1-2 ประโยค","treatment":"1-2 ประโยค","prevention":"1-2 ประโยค","relevantProducts":["ชื่อผลิตภัณฑ์ ONE"],"needVet":false,"disclaimer":"ผลวิเคราะห์เบื้องต้น ควรปรึกษาผู้เชี่ยวชาญ"}`;

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
      response_format: { type: 'json_object' },
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
app.post('/api/chat', async (req, res) => {
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

// ─── GET COMPANY DATA (for frontend) ──────────────────────────────────────
app.get('/api/company', (req, res) => {
  res.json(companyData);
});

// ─── GET CURRENT NEWS ─────────────────────────────────────────────────────
app.get('/api/news', (req, res) => {
  const newsFile = path.join(__dirname, 'news-data.json');
  if (fs.existsSync(newsFile)) {
    res.json(JSON.parse(fs.readFileSync(newsFile, 'utf-8')));
  } else {
    res.json({ articles: [], lastUpdated: null });
  }
});

// ─── RSS FETCH + AI TRANSLATE NEWS ───────────────────────────────────────
const RSS_SOURCES = [
  { url: 'https://hatcheryinternational.com/feed/',              name: 'Hatchery International' },
  { url: 'https://www.aquaculturealliance.org/advocate/feed/',   name: 'GAA Advocate' },
  { url: 'https://www.undercurrentnews.com/feed/',               name: 'Undercurrent News' },
  { url: 'https://www.aquaculturenorthamerica.com/feed/',        name: 'Aquaculture North America' },
];
const AQUA_KEYWORDS = ['shrimp', 'prawn', 'vannamei', 'aquaculture', 'fish', 'ems', 'wssv',
  'white spot', 'seafood', 'fishery', 'hatchery', 'pathogen', 'feed', 'disease', 'marine',
  'tilapia', 'salmon', 'water quality', 'farming', 'harvest', 'export', 'import'];

function parseRSS(xml, sourceName) {
  const items = [];
  const rx = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = block.match(new RegExp(`<${tag}[\\s][^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>|<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return r ? (r[1] || r[2] || '').replace(/<[^>]+>/g, '').trim() : '';
    };
    const linkM = block.match(/<link>([^<]+)<\/link>|<link\s[^>]*href="([^"]+)"/i);
    items.push({
      title:   get('title'),
      url:     linkM ? (linkM[1] || linkM[2] || '').trim() : '',
      summary: get('description').slice(0, 300),
      pubDate: get('pubDate') || get('dc:date') || '',
      source:  sourceName,
    });
  }
  return items;
}

function catLabel(cat) {
  return { industry:'🌏 อุตสาหกรรม', regulation:'📋 กฎระเบียบ', research:'🔬 งานวิจัย', disease:'🦠 โรคสัตว์น้ำ' }[cat] || '🌏 อุตสาหกรรม';
}

let newsRefreshLock = false;
app.post('/api/refresh-news', async (req, res) => {
  if (newsRefreshLock) return res.status(429).json({ error: 'กำลังอัปเดตอยู่ รอสักครู่' });
  newsRefreshLock = true;
  try {
    // 1. Fetch RSS feeds in parallel
    const feedResults = await Promise.allSettled(
      RSS_SOURCES.map(async ({ url, name }) => {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OneAquacultureNewsBot/1.0; +https://one-aquaculture.onrender.com)' },
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) throw new Error(`${r.status}`);
        return parseRSS(await r.text(), name);
      })
    );

    // 2. Collect and filter relevant items
    let items = [];
    feedResults.forEach(r => { if (r.status === 'fulfilled') items.push(...r.value); });
    const relevant = items.filter(it => {
      const text = `${it.title} ${it.summary}`.toLowerCase();
      return AQUA_KEYWORDS.some(kw => text.includes(kw));
    });
    relevant.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    const top = relevant.slice(0, 12);

    if (!top.length) {
      const newsFile = path.join(__dirname, 'news-data.json');
      return res.json(fs.existsSync(newsFile)
        ? JSON.parse(fs.readFileSync(newsFile, 'utf-8'))
        : { articles: [], lastUpdated: null });
    }

    // 3. Build fallback articles (English) first — save immediately so page shows something
    function guessCategory(title, summary) {
      const t = `${title} ${summary}`.toLowerCase();
      if (/disease|virus|bacteria|pathogen|wssv|ehp|ems|outbreak/.test(t)) return 'disease';
      if (/regulation|law|ban|standard|certification|fda|eu|import|export restriction/.test(t)) return 'regulation';
      if (/research|study|trial|technology|genome|crispr|vaccine/.test(t)) return 'research';
      return 'industry';
    }
    const fallbackArticles = top.map(it => {
      const cat = guessCategory(it.title, it.summary);
      return { title: it.title, titleTH: it.title, source: it.source, url: it.url,
        date: it.pubDate ? new Date(it.pubDate).toISOString().slice(0,10) : '',
        category: cat, categoryLabel: catLabel(cat), summary: it.summary };
    });
    const fallbackPayload = { articles: fallbackArticles, lastUpdated: new Date().toISOString(), translated: false };
    fs.writeFileSync(path.join(__dirname, 'news-data.json'), JSON.stringify(fallbackPayload, null, 2));

    // 4. Batch-translate with Claude (best-effort — if it fails, fallback already saved)
    let articles = fallbackArticles;
    try {
      const listed = top.map((it, i) =>
        `[${i}] title: ${it.title}\nsource: ${it.source}\nurl: ${it.url}\ndate: ${it.pubDate}\nexcerpt: ${it.summary}`
      ).join('\n---\n');

      const msg = await client.chat.completions.create({
        model: 'google/gemini-2.5-flash-lite',
        max_tokens: 5000,
        messages: [{
          role: 'user',
          content: `Below are ${top.length} real aquaculture news articles. For each, return a JSON array entry.
Return ONLY a valid JSON array, no markdown fences, no explanation.

Schema per item:
{
  "idx": <number matching [N] above>,
  "titleTH": "แปลชื่อข่าวเป็นภาษาไทย",
  "category": "industry|regulation|research|disease",
  "summary": "สรุป 2 ประโยคภาษาไทย เน้นประโยชน์ต่อเกษตรกรกุ้งไทย"
}

Category rules: disease if mentions disease/pathogen/virus/bacteria; regulation if mentions law/ban/standard/certification; research if mentions study/trial/technology; otherwise industry.

Articles:
${listed}`
        }]
      });

      const raw = msg.choices[0].message.content.trim();
      const parsed = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
      const byIdx = Object.fromEntries(parsed.map(p => [p.idx, p]));

      articles = top.map((it, i) => {
        const ai = byIdx[i] || {};
        const cat = ['industry','regulation','research','disease'].includes(ai.category) ? ai.category : 'industry';
        return { title: it.title, titleTH: ai.titleTH || it.title, source: it.source, url: it.url,
          date: it.pubDate ? new Date(it.pubDate).toISOString().slice(0,10) : '',
          category: cat, categoryLabel: catLabel(cat), summary: ai.summary || it.summary };
      });

      const payload = { articles, lastUpdated: new Date().toISOString(), translated: true };
      fs.writeFileSync(path.join(__dirname, 'news-data.json'), JSON.stringify(payload, null, 2));
    } catch (translateErr) {
      console.error('Claude translate error (using English fallback):', translateErr.message);
    }

    const payload = { articles, lastUpdated: new Date().toISOString() };
    fs.writeFileSync(path.join(__dirname, 'news-data.json'), JSON.stringify(payload, null, 2));
    res.json(payload);
  } catch (err) {
    console.error('refresh-news error:', err.message);
    res.status(500).json({ error: 'อัปเดตข่าวไม่สำเร็จ กรุณาลองใหม่' });
  } finally {
    newsRefreshLock = false;
  }
});

// Auto-refresh news on startup (after 30s) and every 6 hours
async function autoRefreshNews() {
  if (newsRefreshLock) return;
  newsRefreshLock = true;
  try {
    const feedResults = await Promise.allSettled(
      RSS_SOURCES.map(async ({ url, name }) => {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OneAquacultureNewsBot/1.0; +https://one-aquaculture.onrender.com)' },
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) throw new Error(`${r.status}`);
        return parseRSS(await r.text(), name);
      })
    );
    let items = [];
    feedResults.forEach(r => { if (r.status === 'fulfilled') items.push(...r.value); });
    const relevant = items.filter(it => AQUA_KEYWORDS.some(kw => (it.title + ' ' + it.summary).toLowerCase().includes(kw)));
    relevant.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    const top = relevant.slice(0, 12);
    if (!top.length) return;

    const listed = top.map((it, i) =>
      `[${i}] title: ${it.title}\nsource: ${it.source}\nurl: ${it.url}\ndate: ${it.pubDate}\nexcerpt: ${it.summary}`
    ).join('\n---\n');

    const msg = await client.chat.completions.create({
      model: 'google/gemini-2.5-flash-lite',
      max_tokens: 5000,
      messages: [{
        role: 'user',
        content: `Below are ${top.length} real aquaculture news articles. For each, return a JSON array entry.
Return ONLY a valid JSON array, no markdown fences, no explanation.

Schema per item:
{
  "idx": <number matching [N] above>,
  "titleTH": "แปลชื่อข่าวเป็นภาษาไทย",
  "category": "industry|regulation|research|disease",
  "summary": "สรุป 2 ประโยคภาษาไทย เน้นประโยชน์ต่อเกษตรกรกุ้งไทย"
}

Category rules: disease if mentions disease/pathogen/virus/bacteria; regulation if mentions law/ban/standard/certification; research if mentions study/trial/technology; otherwise industry.

Articles:
${listed}`
      }]
    });

    const raw = msg.choices[0].message.content.trim();
    const parsed = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
    const byIdx = Object.fromEntries(parsed.map(p => [p.idx, p]));
    const articles = top.map((it, i) => {
      const ai = byIdx[i] || {};
      const cat = ['industry','regulation','research','disease'].includes(ai.category) ? ai.category : 'industry';
      return {
        title: it.title, titleTH: ai.titleTH || it.title,
        source: it.source, url: it.url,
        date: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : '',
        category: cat, categoryLabel: catLabel(cat),
        summary: ai.summary || it.summary,
      };
    });
    fs.writeFileSync(path.join(__dirname, 'news-data.json'), JSON.stringify({ articles, lastUpdated: new Date().toISOString() }, null, 2));
    console.log(`[news] auto-refreshed ${articles.length} articles`);
  } catch (err) {
    console.error('[news] auto-refresh error:', err.message);
  } finally {
    newsRefreshLock = false;
  }
}
// On startup: refresh if no news file or older than 1 day
setTimeout(async () => {
  const newsFile = path.join(__dirname, 'news-data.json');
  try {
    const data = fs.existsSync(newsFile) ? JSON.parse(fs.readFileSync(newsFile, 'utf-8')) : {};
    const ageMs = data.lastUpdated ? Date.now() - new Date(data.lastUpdated) : Infinity;
    if (ageMs > 24 * 3600_000) await autoRefreshNews();
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

const VET_PASS = process.env.VET_PASSWORD || 'vet1234';

app.get('/api/cases', (req, res) => {
  if (req.query.pass !== VET_PASS) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  res.json(readCases());
});

app.patch('/api/cases/:id', (req, res) => {
  if (req.query.pass !== VET_PASS) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  const cases = readCases();
  const idx = cases.findIndex(c => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'ไม่พบเคส' });
  const { vetNotes, vetDiagnosis, vetSeverity, vetDrugs, vetTreatment, status } = req.body;
  cases[idx] = { ...cases[idx], vetNotes, vetDiagnosis, vetSeverity, vetDrugs, vetTreatment, status, vetTimestamp: new Date().toISOString() };
  writeCases(cases);
  res.json({ ok: true });
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
