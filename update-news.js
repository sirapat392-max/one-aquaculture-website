require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://oneaquaculture.com',
    'X-Title': 'ONE AQUACULTURE PRODUCT',
  },
});

const RSS_SOURCES = [
  // ── English (International) ──────────────────────────────────────────────
  { url: 'https://hatcheryinternational.com/feed/',              name: 'Hatchery International',      lang: 'en' },
  { url: 'https://www.aquaculturealliance.org/advocate/feed/',   name: 'GAA Advocate',                lang: 'en' },
  { url: 'https://www.undercurrentnews.com/feed/',               name: 'Undercurrent News',           lang: 'en' },
  { url: 'https://www.aquaculturenorthamerica.com/feed/',        name: 'Aquaculture North America',   lang: 'en' },
  { url: 'https://www.fishfarmermagazine.com/feed/',             name: 'Fish Farmer Magazine',        lang: 'en' },
  { url: 'https://thefishsite.com/feed',                         name: 'The Fish Site',               lang: 'en' },
  { url: 'https://www.seafoodsource.com/rss/news',               name: 'Seafood Source',              lang: 'en' },
  // ── Thai (ภาษาไทย) ──────────────────────────────────────────────────────
  { url: 'https://www.matichon.co.th/category/agriculture/feed/', name: 'มติชน เกษตร',              lang: 'th' },
  { url: 'https://www.kasetorganic.com/feed/',                   name: 'เกษตรออร์แกนิก',             lang: 'th' },
  { url: 'https://www.naewna.com/economy/agriculture/feed',      name: 'แนวหน้า เกษตร',              lang: 'th' },
  // ── Vietnamese (Tiếng Việt) ──────────────────────────────────────────────
  { url: 'https://thuysanvietnam.com.vn/feed/',                  name: 'Thủy Sản Việt Nam',          lang: 'vi' },
  { url: 'https://tepbac.com/feeds/news/moi.xml',                name: 'Tép Bạc Aquaculture VN',     lang: 'vi' },
  // ── Spanish (Ecuador / Latin America) ───────────────────────────────────
  { url: 'https://www.acuicultura.ws/feed/',                     name: 'Acuicultura (ES)',            lang: 'es' },
  { url: 'https://cna.gov.ec/feed/',                             name: 'CNA Ecuador',                 lang: 'es' },
  // ── Indonesian (Bahasa Indonesia) ────────────────────────────────────────
  { url: 'https://kkp.go.id/djpb/artikel/rss',                  name: 'KKP Indonesia (Gov)',         lang: 'id' },
  { url: 'https://www.trobos.com/rss/aquaculture',               name: 'TROBOS Aqua Indonesia',      lang: 'id' },
  // ── Chinese (中文) ────────────────────────────────────────────────────────
  { url: 'https://www.shuichan.cc/rss.xml',                      name: '水产前沿 (CN)',               lang: 'zh' },
];

const AQUA_KEYWORDS = [
  // English
  'shrimp','prawn','vannamei','aquaculture','fish','ems','wssv',
  'white spot','seafood','fishery','hatchery','pathogen','feed','disease','marine',
  'tilapia','salmon','water quality','farming','harvest','export','import',
  'ehp','ahpnd','vibrio','wfs','ihhnv','yhd',
  // Thai
  'กุ้ง','ปลา','สัตว์น้ำ','เพาะเลี้ยง','โรค','ระบาด','ฟาร์ม','ประมง',
  // Vietnamese
  'tôm','nuôi trồng','thủy sản','dịch bệnh','cá',
  // Spanish
  'camarón','acuicultura','enfermedad','cultivo','pescado',
  // Indonesian
  'udang','budidaya','penyakit','ikan','tambak',
  // Chinese
  '虾','水产','养殖','疾病','病害','对虾',
];

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
    const linkM = block.match(/<link>([^<]+)<\/link>/i);
    const title = get('title');
    if (title) items.push({
      title, url: linkM ? linkM[1].trim() : '',
      summary: get('description').slice(0, 300),
      pubDate: get('pubDate') || get('dc:date') || '',
      source: sourceName,
    });
  }
  return items;
}

function catLabel(cat) {
  return { industry:'🌏 อุตสาหกรรม', regulation:'📋 กฎระเบียบ', research:'🔬 งานวิจัย', disease:'🦠 โรคสัตว์น้ำ' }[cat] || '🌏 อุตสาหกรรม';
}

function guessCategory(title, summary) {
  const t = `${title} ${summary}`.toLowerCase();
  if (/disease|virus|bacteria|pathogen|wssv|ehp|ems|outbreak/.test(t)) return 'disease';
  if (/regulation|law|ban|standard|certification|fda|eu|import restriction/.test(t)) return 'regulation';
  if (/research|study|trial|technology|genome|crispr|vaccine/.test(t)) return 'research';
  return 'industry';
}

async function updateNews() {
  console.log('📡 กำลังดึง RSS จาก', RSS_SOURCES.length, 'แหล่ง...');

  const feedResults = await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, name }) => {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OneAquacultureNewsBot/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      const items = parseRSS(await r.text(), name);
      console.log(`  ✓ ${name}: ${items.length} items`);
      return items;
    })
  );

  let items = [];
  feedResults.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else console.warn(`  ✗ ${RSS_SOURCES[i].name}:`, r.reason.message);
  });

  const relevant = items.filter(it =>
    AQUA_KEYWORDS.some(kw => `${it.title} ${it.summary}`.toLowerCase().includes(kw))
  );
  relevant.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  const top = relevant.slice(0, 12);
  console.log(`\n📰 บทความที่เกี่ยวข้อง: ${relevant.length} → ใช้ ${top.length} บทความ`);

  if (!top.length) {
    console.error('❌ ไม่พบบทความที่เกี่ยวข้อง');
    process.exit(1);
  }

  // Save English fallback first
  const fallback = top.map(it => {
    const cat = guessCategory(it.title, it.summary);
    return { title: it.title, titleTH: it.title, source: it.source, url: it.url,
      date: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : '',
      category: cat, categoryLabel: catLabel(cat), summary: it.summary };
  });

  // Translate with Claude
  console.log('\n🤖 กำลังแปลด้วย Claude Haiku...');
  const listed = top.map((it, i) =>
    `[${i}] title: ${it.title}\nsource: ${it.source}\ndate: ${it.pubDate}\nexcerpt: ${it.summary}`
  ).join('\n---\n');

  const msg = await client.chat.completions.create({
    model: 'google/gemini-2.5-flash-lite',
    max_tokens: 5000,
    messages: [{ role: 'user', content: `You are an aquaculture news analyst. Below are ${top.length} news articles in MIXED LANGUAGES (Thai, English, Vietnamese, Spanish, Indonesian, Chinese). Return ONLY a valid JSON array, no markdown.

Schema: { "idx": N, "titleTH": "ชื่อภาษาไทย", "category": "industry|regulation|research|disease", "summary": "สรุป 2 ประโยคภาษาไทย", "country": "ชื่อประเทศที่เกิดเหตุการณ์ เช่น ไทย, เวียดนาม, อินโดนีเซีย, เอกวาดอร์ (ถ้าไม่ชัดเจนใส่ null)" }

Rules:
- Translate title and summary to Thai regardless of source language
- category: disease = โรค/pathogen/virus/outbreak/ระบาด/dịch bệnh/penyakit/enfermedad/病; regulation = law/ban/กฎ/luật; research = study/งานวิจัย/nghiên cứu; else industry
- country: detect from content — Thai provinces/ไทย = "ไทย", Vietnam/เวียดนาม/Việt Nam = "เวียดนาม", Indonesia/อินโดนีเซีย = "อินโดนีเซีย", Ecuador/เอกวาดอร์ = "เอกวาดอร์", India/อินเดีย = "อินเดีย", China/จีน/中国 = "จีน", Bangladesh/บังกลาเทศ = "บังกลาเทศ"

Articles:\n${listed}` }]
  });

  const raw = msg.choices[0].message.content.trim();
  const parsed = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
  const byIdx = Object.fromEntries(parsed.map(p => [p.idx, p]));

  const articles = top.map((it, i) => {
    const ai = byIdx[i] || {};
    const cat = ['industry','regulation','research','disease'].includes(ai.category) ? ai.category : guessCategory(it.title, it.summary);
    return { title: it.title, titleTH: ai.titleTH || it.title, source: it.source, url: it.url,
      lang: it.lang || 'en',
      date: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : '',
      category: cat, categoryLabel: catLabel(cat), summary: ai.summary || it.summary,
      country: ai.country || null };
  });

  const payload = { articles, lastUpdated: new Date().toISOString(), translated: true };
  fs.writeFileSync(path.join(__dirname, 'news-data.json'), JSON.stringify(payload, null, 2));
  console.log(`\n✅ บันทึก ${articles.length} บทความลง news-data.json`);
  articles.slice(0, 5).forEach((a, i) => console.log(`  ${i+1}. [${a.date}] ${a.titleTH.slice(0, 60)}`));
}

updateNews().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
