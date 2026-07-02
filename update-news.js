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
  // ── English · International / Global ────────────────────────────────────
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
  { url: 'https://globefish.org/rss.xml',                              name: 'FAO Globefish',                lang: 'en' },
  { url: 'https://www.intrafish.com/rss',                              name: 'IntraFish',                    lang: 'en' },
  { url: 'https://www.seafish.org/feed/',                              name: 'Seafish UK',                   lang: 'en' },
  { url: 'https://www.worldfishing.net/feed/',                         name: 'World Fishing & Aquaculture',  lang: 'en' },
  { url: 'https://www.globalseafood.org/feed/',                        name: 'Global Seafood Alliance',      lang: 'en' },
  { url: 'https://advocate.gaalliance.org/feed/',                      name: 'GAA Advocate (alt)',           lang: 'en' },
  { url: 'https://www.fishingwire.com/feed/',                          name: 'FishingWire (Global)',          lang: 'en' },
  { url: 'https://www.nationalfisherman.com/feed/',                    name: 'National Fisherman (US)',       lang: 'en' },
  { url: 'https://www.aquaculturemagazine.com/feed/',                  name: 'Aquaculture Magazine',          lang: 'en' },
  { url: 'https://shrimpnews.com/FreeReportsFolder/NewsFolder/RSSFeed.xml', name: 'ShrimpNews.com',          lang: 'en' },

  // ── Thai · ภาษาไทย ───────────────────────────────────────────────────────
  { url: 'https://www.bangkokpost.com/rss/data/agriculture.xml',       name: 'Bangkok Post Agriculture',    lang: 'en' },
  { url: 'https://www.matichon.co.th/category/agriculture/feed/',      name: 'มติชน เกษตร',                 lang: 'th' },
  { url: 'https://www.naewna.com/economy/agriculture/feed',            name: 'แนวหน้า เกษตร',               lang: 'th' },
  { url: 'https://www.thansettakij.com/category/agriculture/feed',     name: 'ฐานเศรษฐกิจ เกษตร',          lang: 'th' },
  { url: 'https://www.kasetorganic.com/feed/',                         name: 'เกษตรออร์แกนิก',              lang: 'th' },
  { url: 'https://kasetthai.com/feed/',                                name: 'เกษตรไทย',                    lang: 'th' },
  { url: 'https://mgronline.com/qol/rss',                              name: 'MGR Online เกษตร',            lang: 'th' },
  { url: 'https://www.siamrath.co.th/feed/',                           name: 'สยามรัฐ',                     lang: 'th' },
  { url: 'https://www.posttoday.com/economy/agriculture/feed',         name: 'Post Today เกษตร',            lang: 'th' },

  // ── Vietnamese · Tiếng Việt ───────────────────────────────────────────────
  { url: 'https://thuysanvietnam.com.vn/feed/',                        name: 'Thủy Sản Việt Nam',           lang: 'vi' },
  { url: 'https://tepbac.com/feeds/news/moi.xml',                      name: 'Tép Bạc (กุ้ง VN)',          lang: 'vi' },
  { url: 'https://vasep.com.vn/tin-tuc/rss',                           name: 'VASEP (สมาคมส่งออก VN)',      lang: 'vi' },
  { url: 'https://vietfish.org/feed/',                                  name: 'VietFish',                    lang: 'vi' },
  { url: 'https://contom.vn/feed/',                                    name: 'Con Tôm (เฉพาะกุ้ง VN)',     lang: 'vi' },
  { url: 'https://aquaculture.vn/feed/',                               name: 'Aquaculture VN',              lang: 'vi' },
  { url: 'https://tongcucthuysan.gov.vn/rss',                          name: 'กรมประมง VN (Gov)',           lang: 'vi' },
  { url: 'https://mard.gov.vn/Pages/rss.aspx',                        name: 'กระทรวงเกษตร VN (Gov)',       lang: 'vi' },
  { url: 'https://nongnghiep.vn/rss/thuysan.rss',                     name: 'Nông Nghiệp VN',             lang: 'vi' },
  { url: 'https://danviet.vn/rss/nong-nghiep.rss',                    name: 'Dân Việt เกษตร',             lang: 'vi' },
  { url: 'https://baomoi.com/c/nuoi-trong-thuy-san.epi',              name: 'Báo Mới ประมง',              lang: 'vi' },

  // ── Spanish · Ecuador / Latin America ────────────────────────────────────
  { url: 'https://www.acuicultura.ws/feed/',                           name: 'Acuicultura.ws (ES)',          lang: 'es' },
  { url: 'https://cna.gov.ec/feed/',                                   name: 'CNA Ecuador (Gov)',            lang: 'es' },
  { url: 'https://www.camaroneros.net/feed/',                          name: 'Camaroneros (EC)',             lang: 'es' },
  { url: 'https://infopesca.org/feed/',                                name: 'Infopesca (LA)',               lang: 'es' },
  { url: 'https://www.panorama-acuicola.com/feed/',                    name: 'Panorama Acuícola (MX)',       lang: 'es' },
  { url: 'https://www.aquahoy.com/category/camarón/feed/',             name: 'AquaHoy Camarón (EC)',        lang: 'es' },
  { url: 'https://www.expreso.ec/economia/feed/',                      name: 'Expreso Ecuador',              lang: 'es' },

  // ── Indonesian · Bahasa Indonesia ────────────────────────────────────────
  { url: 'https://kkp.go.id/djpb/artikel/rss',                        name: 'KKP DJPB Indonesia (Gov)',    lang: 'id' },
  { url: 'https://kkp.go.id/bpbl/artikel/rss',                        name: 'KKP BPBL Indonesia (Gov)',    lang: 'id' },
  { url: 'https://www.trobos.com/rss/aquaculture',                     name: 'TROBOS Aqua (ID)',            lang: 'id' },
  { url: 'https://mediaakuakultur.com/feed/',                          name: 'Media Akuakultur (ID)',        lang: 'id' },
  { url: 'https://www.hobinatang.com/feed/',                           name: 'Hobi Natang (ID)',             lang: 'id' },
  { url: 'https://www.dkp.go.id/rss/',                                name: 'DKP Indonesia (Gov)',          lang: 'id' },
  { url: 'https://infomedia.co.id/feed/',                              name: 'Infomedia Perikanan (ID)',     lang: 'id' },
  { url: 'https://www.perikanan.co.id/feed/',                          name: 'Perikanan Indonesia',          lang: 'id' },

  // ── India · English + Hindi + Telugu + Tamil ─────────────────────────────
  // English (national / trade)
  { url: 'https://www.mpeda.gov.in/rss.xml',                          name: 'MPEDA India (Gov)',            lang: 'en' },
  { url: 'https://www.seafoodexporters.in/feed/',                      name: 'Seafood Exporters India',     lang: 'en' },
  { url: 'https://aquacultureindia.com/feed/',                         name: 'Aquaculture India',           lang: 'en' },
  { url: 'https://www.thehindubusinessline.com/rss/agriculture/',      name: 'Hindu BusinessLine Agri',     lang: 'en' },
  { url: 'https://www.thehindu.com/sci-tech/agriculture/feeder/default.rss', name: 'The Hindu Agriculture', lang: 'en' },
  // Hindi
  { url: 'https://krishijagran.com/feed/',                             name: 'Krishi Jagran (Hi)',          lang: 'hi' },
  { url: 'https://www.jagran.com/rss/business-agriculture.xml',        name: 'Jagran Agri (Hi)',            lang: 'hi' },
  { url: 'https://hindi.krishijagran.com/feed/',                       name: 'Krishi Jagran Hindi',         lang: 'hi' },
  // Telugu — Andhra Pradesh & Telangana (largest shrimp states)
  { url: 'https://www.eenadu.net/rss/fishing.xml',                     name: 'Eenadu మత్స్య (Te)',         lang: 'te' },
  { url: 'https://www.andhrajyothy.com/rss/agriculture.xml',           name: 'Andhra Jyothy Agri (Te)',     lang: 'te' },
  { url: 'https://www.sakshi.com/rss/agriculture.xml',                 name: 'Sakshi Agri (Te)',            lang: 'te' },
  // Tamil — Tamil Nadu shrimp farming
  { url: 'https://www.dinamalar.com/rss/agriculture.xml',              name: 'Dinamalar Agri (Ta)',         lang: 'ta' },
  { url: 'https://www.dinakaran.com/rss/agri.xml',                     name: 'Dinakaran Agri (Ta)',         lang: 'ta' },

  // ── Chinese · 中文 ────────────────────────────────────────────────────────
  { url: 'https://www.shuichan.cc/rss.xml',                           name: '水产前沿 (CN)',                lang: 'zh' },
  { url: 'https://www.fishfirst.cn/rss.xml',                          name: '鱼虾蟹 (CN)',                  lang: 'zh' },
  { url: 'https://www.chinaaquaculture.com/rss/',                     name: 'China Aquaculture',            lang: 'zh' },
  { url: 'https://www.aquainfo.cn/rss.xml',                           name: 'AquaInfo China',               lang: 'zh' },
  { url: 'https://www.moa.gov.cn/rss/index.rss',                     name: 'กระทรวงเกษตร China (Gov)',    lang: 'zh' },

  // ── Bangladesh · English + Bengali ───────────────────────────────────────
  { url: 'https://www.aquabangla.com/feed/',                          name: 'Aqua Bangladesh',              lang: 'en' },
  { url: 'https://fisheries.gov.bd/rss',                              name: 'DoF Bangladesh (Gov)',          lang: 'en' },
  // Bengali
  { url: 'https://www.prothomalo.com/economy/agriculture/feed',       name: 'Prothom Alo কৃষি (bn)',       lang: 'bn' },
  { url: 'https://www.kalerkantho.com/rss/agriculture.xml',           name: 'Kaler Kantho কৃষি (bn)',      lang: 'bn' },
  { url: 'https://www.ittefaq.com.bd/rss/agriculture',                name: 'Ittefaq মৎস্য (bn)',          lang: 'bn' },
  { url: 'https://www.samakal.com/rss/agriculture.xml',               name: 'Samakal মৎস্য (bn)',          lang: 'bn' },

  // ── Philippines · English + Filipino ─────────────────────────────────────
  { url: 'https://bfar.da.gov.ph/rss',                                name: 'BFAR Philippines (Gov)',       lang: 'en' },
  { url: 'https://www.philaquaculture.org/feed/',                     name: 'PhilAquaculture',              lang: 'en' },
  { url: 'https://www.da.gov.ph/feed/',                               name: 'DA Philippines (Gov)',          lang: 'en' },
  { url: 'https://www.philstar.com/rss/business/agribusiness',        name: 'PhilStar Agribusiness',        lang: 'en' },
  { url: 'https://www.manilatimes.net/category/business/agribusiness/feed/', name: 'Manila Times Agri',    lang: 'en' },
  // Filipino
  { url: 'https://www.abante.com.ph/category/agri/feed/',             name: 'Abante Agri (fil)',            lang: 'fil' },
  { url: 'https://www.pna.gov.ph/rss/agriculture',                    name: 'PNA Philippines (Gov fil)',    lang: 'fil' },
  { url: 'https://balita.ph/category/agrikultura/feed/',              name: 'Balita Agrikultura (fil)',     lang: 'fil' },

  // ── Malaysia · English + Malay + Chinese ──────────────────────────────────
  { url: 'https://www.dof.gov.my/rss',                                name: 'DOF Malaysia (Gov ms)',         lang: 'ms' },
  { url: 'https://aquaculturemalaysia.com/feed/',                     name: 'Aquaculture Malaysia',          lang: 'en' },
  { url: 'https://aquakultur.my/feed/',                               name: 'Aquakultur Malaysia (ms)',      lang: 'ms' },
  // Malay
  { url: 'https://www.utusan.com.my/rss/tani.xml',                    name: 'Utusan Tani (ms)',             lang: 'ms' },
  { url: 'https://www.bharian.com.my/rss/agro.xml',                   name: 'Berita Harian Agro (ms)',      lang: 'ms' },
  // Malaysian Chinese
  { url: 'https://www.sinchew.com.my/rss/category/agro.xml',         name: '星洲日報 農業 (zh-MY)',         lang: 'zh' },
  { url: 'https://www.chinapress.com.my/rss/agri.xml',               name: '中國報 農業 (zh-MY)',           lang: 'zh' },

  // ── Myanmar · English + Burmese ───────────────────────────────────────────
  { url: 'https://www.mmtimes.com/feed/',                             name: 'Myanmar Times (en)',            lang: 'en' },
  { url: 'https://www.myanmarfish.com/feed/',                         name: 'Myanmar Fish (en)',             lang: 'en' },
  // Burmese
  { url: 'https://www.moi.gov.mm/moi:eng/rss.xml',                   name: 'MoI Myanmar (Gov my)',          lang: 'my' },
  { url: 'https://www.gnlm.com.mm/rss/agri.xml',                     name: 'GNLM Myanmar Agri (my)',        lang: 'my' },
  { url: 'https://www.7daydaily.com/rss/agri.xml',                    name: '7 Day Daily Myanmar (my)',      lang: 'my' },

  // ── Japan · 日本語 ────────────────────────────────────────────────────────
  { url: 'https://www.jfa.maff.go.jp/j/press/rss.xml',               name: '水産庁 Japan (Gov)',            lang: 'ja' },
  { url: 'https://www.suisan-times.co.jp/feed/',                      name: '水産タイムズ',                  lang: 'ja' },
  { url: 'https://www.nishinippon.co.jp/rss/category/fishing.xml',   name: '西日本新聞 水産',               lang: 'ja' },
  { url: 'https://www.aquaculture.or.jp/feed/',                       name: 'Japan Aquaculture Society',     lang: 'ja' },
  { url: 'https://www.minato-yamaguchi.co.jp/rss/',                   name: '水産経済新聞',                  lang: 'ja' },
  { url: 'https://www.fisheries.hokkaido.jp/feed/',                   name: '北海道水産 (Gov)',               lang: 'ja' },

  // ── Korea · 한국어 ────────────────────────────────────────────────────────
  { url: 'https://www.nifs.go.kr/rss/rss.do',                        name: '국립수산과학원 NIFS (Gov)',     lang: 'ko' },
  { url: 'https://www.mof.go.kr/rss/rss.do',                         name: '해양수산부 MOF (Gov)',          lang: 'ko' },
  { url: 'https://www.suhyup.co.kr/rss/rss.do',                      name: '수협중앙회',                    lang: 'ko' },
  { url: 'https://susaninews.com/feed/',                              name: '수산인신문',                    lang: 'ko' },
  { url: 'https://www.fisheries.go.kr/rss/rss.do',                   name: 'KIS Korea Fisheries',           lang: 'ko' },
  { url: 'https://www.aqua.re.kr/rss/',                              name: '수산과학원 Aqua KR',             lang: 'ko' },

  // ── Australia · English ───────────────────────────────────────────────────
  { url: 'https://www.frdc.com.au/news/rss',                         name: 'FRDC Australia',                lang: 'en' },
  { url: 'https://www.australianseafood.com.au/news/feed/',           name: 'Australian Seafood Ind.',       lang: 'en' },
  { url: 'https://www.apfa.com.au/news/feed/',                        name: 'APFA (Aust Prawn Farmers)',     lang: 'en' },
  { url: 'https://www.sria.com.au/feed/',                             name: 'SRIA (Shrimp R&D AU)',          lang: 'en' },
  { url: 'https://www.agrifutures.com.au/feed/',                      name: 'AgriFutures Australia',         lang: 'en' },
  { url: 'https://www.fishingworld.com.au/feed/',                     name: 'Fishing World AU',              lang: 'en' },
];

const AQUA_KEYWORDS = [
  // English — shrimp-specific
  'shrimp','prawn','vannamei','penaeus','litopenaeus','monodon','kuruma prawn',
  'ems','wssv','white spot syndrome','ehp','ahpnd','vibrio','wfs','ihhnv','yhd',
  'necrotizing hepatopancreatitis','running mortality syndrome','acute hepatopancreatic',
  'shrimp farm','shrimp pond','shrimp hatchery','shrimp feed','shrimp export',
  'shrimp price','shrimp production','shrimp disease','shrimp harvest','shrimp mortality',
  'postlarva','nauplii','broodstock','shrimp breeding','shrimp pathogen',
  // Thai
  'กุ้ง','โรคกุ้ง','ฟาร์มกุ้ง','บ่อกุ้ง','กุ้งขาว','กุ้งกุลาดำ',
  'ตัวอ่อนกุ้ง','กุ้งแวนนาไม','ลูกกุ้ง','พันธุ์กุ้ง',
  // Vietnamese
  'tôm','dịch bệnh tôm','nuôi tôm','tôm thẻ','tôm sú','tôm giống',
  'bệnh tôm','ao tôm','xuất khẩu tôm','giá tôm',
  // Spanish
  'camarón','langostino','camarón vannamei','cultivo de camarón',
  'enfermedad del camarón','producción de camarón','granja camaronera',
  // Indonesian
  'udang','tambak udang','udang vaname','penyakit udang','budidaya udang',
  'udang windu','benih udang','ekspor udang','harga udang',
  // Chinese
  '虾','对虾','白虾','虾病','养虾','虾产量','虾苗','虾养殖','出口虾',
  // Japanese
  'エビ','海老','養殖エビ','クルマエビ','バナメイエビ','ウシエビ',
  'エビ養殖','エビ病','エビ疾病','水産養殖','エビ生産',
  // Korean
  '새우','새우 양식','흰반점','새우 질병','바나메이','새우 생산',
  '양식 새우','수출 새우','새우 가격','새우 농장',
  // Filipino/Tagalog
  'hipon','palakaya','aquaculture hipon','sakit ng hipon','pagsasaka hipon',
  'pagpapalaki ng hipon','lambak ng hipon',
  // Malay
  'udang','akuakultur udang','penyakit udang','ladang udang','eksport udang',
  'ternakan udang','baka udang','benih udang',
  // Bengali (Bangladesh / West Bengal India)
  'চিংড়ি','চিংড়ি চাষ','চিংড়ি রোগ','মৎস্য','রফতানি চিংড়ি',
  'গলদা চিংড়ি','বাগদা চিংড়ি','মৎস্য চাষ',
  // Hindi (India)
  'झींगा','चिंगारी','झींगा पालन','झींगा रोग','जलकृषि','मत्स्य पालन',
  'झींगा निर्यात','वानामी झींगा',
  // Telugu (Andhra Pradesh / Telangana — largest shrimp producing states)
  'రొయ్యలు','రొయ్యల సాగు','రొయ్యల వ్యాధి','జలసాగు','మత్స్య',
  'వనామీ రొయ్యలు','ఎగుమతి రొయ్యలు',
  // Tamil (Tamil Nadu)
  'இறால்','இறால் வளர்ப்பு','இறால் நோய்','மீன்வளம்','கடல்வளம்',
  'வெள்ளை இறால்','ஏற்றுமதி இறால்',
  // Burmese (Myanmar)
  'ပုဇွန်','ပုဇွန်မွေးမြူ','ရေထွက်ကုန်','ငါးလုပ်ငန်း',
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
    if (r.status === 'fulfilled') {
      // Limit 3 articles per source so no single feed dominates
      items.push(...r.value.slice(0, 3).map(it => ({ ...it, lang: RSS_SOURCES[i].lang || 'en' })));
    } else {
      console.warn(`  ✗ ${RSS_SOURCES[i].name}:`, r.reason.message);
    }
  });

  // Load existing articles to merge (dedup by URL)
  let existingArticles = [];
  const dataPath = path.join(__dirname, 'news-data.json');
  if (fs.existsSync(dataPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      // Keep only shrimp articles when loading existing data (purge old fish articles)
      existingArticles = (existing.articles || []).filter(a => {
        if (a.isSample) return false;
        const text = `${a.title || ''} ${a.titleTH || ''} ${a.summary || ''}`;
        return AQUA_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
      });
    } catch {}
  }
  const existingUrls = new Set(existingArticles.map(a => a.url).filter(Boolean));

  const relevant = items.filter(it =>
    it.url &&
    !existingUrls.has(it.url) &&
    AQUA_KEYWORDS.some(kw => `${it.title} ${it.summary}`.toLowerCase().includes(kw.toLowerCase()))
  );
  relevant.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

  // Balance languages — no single language > 40% of batch
  const MAX_BATCH = 20;
  const MAX_PER_LANG = Math.ceil(MAX_BATCH * 0.4);
  const langCount = {};
  const top = [];
  for (const it of relevant) {
    const l = it.lang || 'en';
    langCount[l] = (langCount[l] || 0) + 1;
    if (langCount[l] <= MAX_PER_LANG) top.push(it);
    if (top.length >= MAX_BATCH) break;
  }
  console.log(`\n📰 บทความใหม่: ${relevant.length} → ประมวลผล ${top.length} (balance: ${JSON.stringify(langCount)})`);

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
    messages: [{ role: 'user', content: `You are a shrimp aquaculture news analyst. Below are ${top.length} articles in MIXED LANGUAGES (Thai, English, Vietnamese, Spanish, Indonesian, Chinese, Japanese, Korean, Malay, Bengali, Filipino). Return ONLY a valid JSON array, no markdown.

Schema: { "idx": N, "titleTH": "ชื่อภาษาไทย", "category": "industry|regulation|research|disease", "summary": "สรุป 2 ประโยคภาษาไทย", "country": "ชื่อประเทศที่เกิดเหตุการณ์ เช่น ไทย, เวียดนาม, อินโดนีเซีย, เอกวาดอร์ (ถ้าไม่ชัดเจนใส่ null)" }

Rules:
- Translate title and summary to Thai regardless of source language
- category: disease = โรค/pathogen/virus/outbreak/ระบาด/dịch bệnh/penyakit/enfermedad/病; regulation = law/ban/กฎ/luật; research = study/งานวิจัย/nghiên cứu; else industry
- country: detect which country the EVENT happened in (NOT the source country). Use Thai names:
  ไทย (Thailand/Thai/ประเทศไทย), เวียดนาม (Vietnam/Việt Nam), อินโดนีเซีย (Indonesia/Indonesian),
  เอกวาดอร์ (Ecuador/camaroneros), อินเดีย (India/Indian/Andhra/รொయ్యలు/इंडिया/भारत/இந்தியா),
  จีน (China/Chinese/中国/中國), บังกลาเทศ (Bangladesh/বাংলাদেশ), ฟิลิปปินส์ (Philippines/Pilipinas/hipon),
  มาเลเซีย (Malaysia/Malaysian/Perikanan Malaysia), เมียนมา (Myanmar/Burma/မြန်မာ),
  ญี่ปุ่น (Japan/Japanese/エビ/日本), เกาหลี (Korea/Korean/새우/한국),
  ออสเตรเลีย (Australia/Australian/FRDC/prawn Australia), บราซิล (Brazil/Brasil/camarão)
  → ใส่ null ถ้าเป็นข่าวระดับโลกหรือไม่ชัดเจน

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
