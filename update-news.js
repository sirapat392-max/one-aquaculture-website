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
  // ── English · International Organizations ────────────────────────────────
  { url: 'https://hatcheryinternational.com/feed/',                    name: 'Hatchery International',       lang: 'en' },
  { url: 'https://www.aquaculturealliance.org/advocate/feed/',         name: 'GAA Advocate',                 lang: 'en' },
  { url: 'https://www.undercurrentnews.com/feed/',                     name: 'Undercurrent News',            lang: 'en' },
  { url: 'https://www.aquaculturenorthamerica.com/feed/',              name: 'Aquaculture North America',    lang: 'en' },
  { url: 'https://thefishsite.com/feed',                               name: 'The Fish Site',                lang: 'en' },
  { url: 'https://www.seafoodsource.com/rss/news',                     name: 'Seafood Source',               lang: 'en' },
  { url: 'https://www.fishfarmermagazine.com/feed/',                   name: 'Fish Farmer Magazine',         lang: 'en' },
  { url: 'https://aquaculturehub.org/feed/',                           name: 'Aquaculture Hub',              lang: 'en' },
  { url: 'https://enaca.org/?feed=rss2',                               name: 'NACA (Asia-Pacific)',          lang: 'en' },
  { url: 'https://www.aquahoy.com/rss.xml',                            name: 'AquaHoy (Global)',             lang: 'en' },
  { url: 'https://globefish.org/rss.xml',                              name: 'FAO Globefish',               lang: 'en' },
  { url: 'https://www.intrafish.com/rss',                              name: 'IntraFish',                    lang: 'en' },
  { url: 'https://www.seafish.org/feed/',                              name: 'Seafish UK',                   lang: 'en' },

  // ── Thai · ภาษาไทย ───────────────────────────────────────────────────────
  { url: 'https://www.bangkokpost.com/rss/data/agriculture.xml',       name: 'Bangkok Post Agriculture',    lang: 'en' },
  { url: 'https://www.matichon.co.th/category/agriculture/feed/',      name: 'มติชน เกษตร',                 lang: 'th' },
  { url: 'https://www.naewna.com/economy/agriculture/feed',            name: 'แนวหน้า เกษตร',               lang: 'th' },
  { url: 'https://www.thansettakij.com/category/agriculture/feed',     name: 'ฐานเศรษฐกิจ เกษตร',          lang: 'th' },
  { url: 'https://www.kasetorganic.com/feed/',                         name: 'เกษตรออร์แกนิก',              lang: 'th' },
  { url: 'https://kasetthai.com/feed/',                                name: 'เกษตรไทย',                    lang: 'th' },
  { url: 'https://mgronline.com/qol/rss',                              name: 'MGR Online เกษตร',            lang: 'th' },
  { url: 'https://www.siamrath.co.th/feed/',                           name: 'สยามรัฐ',                     lang: 'th' },

  // ── Vietnamese · Tiếng Việt ───────────────────────────────────────────────
  { url: 'https://thuysanvietnam.com.vn/feed/',                        name: 'Thủy Sản Việt Nam',           lang: 'vi' },
  { url: 'https://tepbac.com/feeds/news/moi.xml',                      name: 'Tép Bạc (กุ้ง VN)',          lang: 'vi' },
  { url: 'https://vasep.com.vn/tin-tuc/rss',                           name: 'VASEP (สมาคมส่งออก VN)',      lang: 'vi' },
  { url: 'https://vietfish.org/feed/',                                  name: 'VietFish',                    lang: 'vi' },
  { url: 'https://contom.vn/feed/',                                    name: 'Con Tôm (เฉพาะกุ้ง VN)',     lang: 'vi' },
  { url: 'https://aquaculture.vn/feed/',                               name: 'Aquaculture VN',              lang: 'vi' },
  // ราชการเวียดนาม
  { url: 'https://tongcucthuysan.gov.vn/rss',                          name: 'กรมประมง VN (Gov)',           lang: 'vi' },
  { url: 'https://mard.gov.vn/Pages/rss.aspx',                        name: 'กระทรวงเกษตร VN (Gov)',       lang: 'vi' },
  // สื่อท้องถิ่นเวียดนาม
  { url: 'https://nongnghiep.vn/rss/thuysan.rss',                     name: 'Nông Nghiệp VN (เกษตร VN)',  lang: 'vi' },
  { url: 'https://nongnghiep.vn/rss/chan-nuoi-thuy-san.rss',          name: 'Nông Nghiệp · ประมง VN',     lang: 'vi' },
  { url: 'https://danviet.vn/rss/nong-nghiep.rss',                    name: 'Dân Việt เกษตร',             lang: 'vi' },
  { url: 'https://baomoi.com/c/nuoi-trong-thuy-san.epi',              name: 'Báo Mới ประมง',              lang: 'vi' },
  { url: 'https://www.bienphong.com.vn/rss/kinh-te.rss',              name: 'Biên Phòng เศรษฐกิจ',        lang: 'vi' },

  // ── Spanish · Ecuador / Latin America ────────────────────────────────────
  { url: 'https://www.acuicultura.ws/feed/',                           name: 'Acuicultura.ws (ES)',          lang: 'es' },
  { url: 'https://cna.gov.ec/feed/',                                   name: 'CNA Ecuador (Gov)',            lang: 'es' },
  { url: 'https://www.camaroneros.net/feed/',                          name: 'Camaroneros (EC)',             lang: 'es' },
  { url: 'https://infopesca.org/feed/',                                name: 'Infopesca (LA)',               lang: 'es' },
  { url: 'https://www.panorama-acuicola.com/feed/',                    name: 'Panorama Acuícola (MX)',       lang: 'es' },

  // ── Indonesian · Bahasa Indonesia ────────────────────────────────────────
  { url: 'https://kkp.go.id/djpb/artikel/rss',                        name: 'KKP DJPB Indonesia (Gov)',    lang: 'id' },
  { url: 'https://kkp.go.id/bpbl/artikel/rss',                        name: 'KKP BPBL Indonesia (Gov)',    lang: 'id' },
  { url: 'https://www.trobos.com/rss/aquaculture',                     name: 'TROBOS Aqua (ID)',            lang: 'id' },
  { url: 'https://mediaakuakultur.com/feed/',                          name: 'Media Akuakultur (ID)',        lang: 'id' },
  { url: 'https://www.hobinatang.com/feed/',                           name: 'Hobi Natang (ID)',             lang: 'id' },

  // ── Indian · English (India local) ───────────────────────────────────────
  { url: 'https://www.mpeda.gov.in/rss.xml',                          name: 'MPEDA India (Gov)',            lang: 'en' },
  { url: 'https://www.seafoodexporters.in/feed/',                      name: 'Seafood Exporters India',     lang: 'en' },
  { url: 'https://aquacultureindia.com/feed/',                         name: 'Aquaculture India',           lang: 'en' },

  // ── Chinese · 中文 ────────────────────────────────────────────────────────
  { url: 'https://www.shuichan.cc/rss.xml',                           name: '水产前沿 (CN)',                lang: 'zh' },
  { url: 'https://www.fishfirst.cn/rss.xml',                          name: '鱼虾蟹 (CN)',                  lang: 'zh' },
  { url: 'https://www.chinaaquaculture.com/rss/',                     name: 'China Aquaculture',            lang: 'zh' },

  // ── Bangladesh · English ──────────────────────────────────────────────────
  { url: 'https://www.aquabangla.com/feed/',                          name: 'Aqua Bangladesh',             lang: 'en' },
  { url: 'https://fisheries.gov.bd/rss',                              name: 'DoF Bangladesh (Gov)',         lang: 'en' },

  // ── Philippines · English ─────────────────────────────────────────────────
  { url: 'https://bfar.da.gov.ph/rss',                                name: 'BFAR Philippines (Gov)',      lang: 'en' },
  { url: 'https://www.philaquaculture.org/feed/',                     name: 'PhilAquaculture',             lang: 'en' },

  // ── Malaysia · English ────────────────────────────────────────────────────
  { url: 'https://www.dof.gov.my/rss',                                name: 'DOF Malaysia (Gov)',           lang: 'en' },
  { url: 'https://aquaculturemalaysia.com/feed/',                     name: 'Aquaculture Malaysia',        lang: 'en' },
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
    if (r.status === 'fulfilled') items.push(...r.value.map(it => ({ ...it, lang: RSS_SOURCES[i].lang || 'en' })));
    else console.warn(`  ✗ ${RSS_SOURCES[i].name}:`, r.reason.message);
  });

  // Load existing articles to merge (dedup by URL)
  let existingArticles = [];
  const dataPath = path.join(__dirname, 'news-data.json');
  if (fs.existsSync(dataPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      existingArticles = (existing.articles || []).filter(a => !a.isSample);
    } catch {}
  }
  const existingUrls = new Set(existingArticles.map(a => a.url).filter(Boolean));

  const relevant = items.filter(it =>
    it.url &&
    !existingUrls.has(it.url) &&  // dedup — skip already-stored articles
    AQUA_KEYWORDS.some(kw => `${it.title} ${it.summary}`.toLowerCase().includes(kw))
  );
  relevant.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  const top = relevant.slice(0, 20); // process up to 20 new articles per run
  console.log(`\n📰 บทความใหม่: ${relevant.length} → ประมวลผล ${top.length} บทความ`);

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

  const today = new Date().toISOString().slice(0, 10);
  const newArticles = top.map((it, i) => {
    const ai = byIdx[i] || {};
    const cat = ['industry','regulation','research','disease'].includes(ai.category) ? ai.category : guessCategory(it.title, it.summary);
    return {
      title: it.title, titleTH: ai.titleTH || it.title, source: it.source, url: it.url,
      lang: it.lang || 'en',
      date: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : today,
      firstSeen: today, // for decay model — when WE first saw this article
      category: cat, categoryLabel: catLabel(cat), summary: ai.summary || it.summary,
      country: ai.country || null,
    };
  });

  // Merge new + existing, keep newest 200 articles max, drop articles older than 90 days
  const cutoff90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const merged = [...newArticles, ...existingArticles]
    .filter(a => (a.date || '9999') >= cutoff90)
    .slice(0, 200);

  const payload = { articles: merged, lastUpdated: new Date().toISOString(), translated: true };
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2));
  console.log(`\n✅ บันทึก ${newArticles.length} บทความใหม่ + ${existingArticles.length} เก่า = ${merged.length} รวม`);
  newArticles.slice(0, 5).forEach((a, i) => console.log(`  ${i+1}. [${a.date}][${a.country||'?'}] ${a.titleTH.slice(0, 60)}`));
}

updateNews().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
