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
  // ── Google News RSS (reliable, never blocked, aggregates thousands of sources) ──
  { url: "https://news.google.com/rss/search?q=shrimp+aquaculture&hl=en-US&gl=US&ceid=US:en",            name: 'Google News: shrimp aquaculture', lang: 'en' },
  { url: "https://news.google.com/rss/search?q=shrimp+disease+outbreak&hl=en-US&gl=US&ceid=US:en",       name: 'Google News: shrimp disease',    lang: 'en' },
  { url: "https://news.google.com/rss/search?q=shrimp+export+import+trade&hl=en-US&gl=US&ceid=US:en",    name: 'Google News: shrimp trade',      lang: 'en' },
  { url: "https://news.google.com/rss/search?q=prawn+vannamei+penaeus&hl=en-US&gl=US&ceid=US:en",        name: 'Google News: prawn vannamei',    lang: 'en' },
  { url: "https://news.google.com/rss/search?q=WSSV+EHP+AHPND+shrimp&hl=en-US&gl=US&ceid=US:en",        name: 'Google News: shrimp pathogen',   lang: 'en' },
  { url: "https://news.google.com/rss/search?q=shrimp+price+market+2026&hl=en-US&gl=US&ceid=US:en",      name: 'Google News: shrimp price',      lang: 'en' },
  { url: "https://news.google.com/rss/search?q=%E0%B8%81%E0%B8%B8%E0%B9%89%E0%B8%87&hl=th&gl=TH&ceid=TH:th", name: 'Google News: กุ้ง (TH)',    lang: 'th' },
  { url: "https://news.google.com/rss/search?q=%E0%B8%81%E0%B8%B8%E0%B9%89%E0%B8%87+%E0%B9%82%E0%B8%A3%E0%B8%84&hl=th&gl=TH&ceid=TH:th", name: 'Google News: กุ้งโรค (TH)', lang: 'th' },
  { url: "https://news.google.com/rss/search?q=t%C3%B4m+nu%C3%B4i+xu%E1%BA%A5t+kh%E1%BA%A9u&hl=vi&gl=VN&ceid=VN:vi", name: 'Google News: tôm VN', lang: 'vi' },
  { url: "https://news.google.com/rss/search?q=camar%C3%B3n+camaronero+Ecuador&hl=es&gl=EC&ceid=EC:es",  name: 'Google News: camarón EC',        lang: 'es' },
  { url: "https://news.google.com/rss/search?q=udang+vaname+penyakit&hl=id&gl=ID&ceid=ID:id",            name: 'Google News: udang ID',          lang: 'id' },
  { url: "https://news.google.com/rss/search?q=shrimp+India+export+aquaculture&hl=en-IN&gl=IN&ceid=IN:en", name: 'Google News: shrimp India',    lang: 'en' },
  { url: "https://news.google.com/rss/search?q=%E0%A6%9A%E0%A6%BF%E0%A6%82%E0%A6%A1%E0%A6%BC%E0%A6%BF+%E0%A6%9A%E0%A6%BE%E0%A6%B7&hl=bn&gl=BD&ceid=BD:bn", name: 'Google News: চিংড়ি BD', lang: 'bn' },
  { url: "https://news.google.com/rss/search?q=%E3%82%A8%E3%83%93+%E9%A4%8A%E6%AE%96+%E8%BC%B8%E5%87%BA&hl=ja&gl=JP&ceid=JP:ja", name: 'Google News: エビ JP',  lang: 'ja' },
  { url: "https://news.google.com/rss/search?q=%EC%83%88%EC%9A%B0+%EC%96%91%EC%8B%9D+%EC%88%98%EC%B6%9C&hl=ko&gl=KR&ceid=KR:ko", name: 'Google News: 새우 KR',  lang: 'ko' },
  { url: "https://news.google.com/rss/search?q=shrimp+Australia+prawn+export&hl=en-AU&gl=AU&ceid=AU:en", name: 'Google News: prawn AU',           lang: 'en' },
  { url: "https://news.google.com/rss/search?q=camar%C3%A3o+aquicultura+exporta%C3%A7%C3%A3o&hl=pt&gl=BR&ceid=BR:pt", name: 'Google News: camarão BR', lang: 'pt' },
  { url: "https://news.google.com/rss/search?q=%E8%99%BE+%E5%85%BB%E6%AE%96+%E5%87%BA%E5%8F%A3&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", name: 'Google News: 虾 CN',   lang: 'zh' },
  { url: "https://news.google.com/rss/search?q=shrimp+Philippines+hipon+aquaculture&hl=en-PH&gl=PH&ceid=PH:en", name: 'Google News: shrimp PH',   lang: 'en' },
  { url: "https://news.google.com/rss/search?q=shrimp+Myanmar+prawn&hl=en&gl=MM&ceid=MM:en",              name: 'Google News: shrimp MM',         lang: 'en' },

  // ── Global · Shrimp & Aquaculture ───────────────────────────────────────
  { url: 'https://hatcheryinternational.com/feed/',                    name: 'Hatchery International',       lang: 'en' },
  { url: 'https://www.aquaculturealliance.org/advocate/feed/',         name: 'GAA Advocate',                 lang: 'en' },
  { url: 'https://www.undercurrentnews.com/feed/',                     name: 'Undercurrent News',            lang: 'en' },
  { url: 'https://www.aquaculturenorthamerica.com/feed/',              name: 'Aquaculture North America',    lang: 'en' },
  { url: 'https://www.aquafeed.com/feed',                              name: 'Aquafeed.com News',            lang: 'en' },
  { url: 'https://www.seafoodsource.com/rss/news',                     name: 'Seafood Source',               lang: 'en' },
  { url: 'https://aquaculturehub.org/feed/',                           name: 'Aquaculture Hub',              lang: 'en' },
  { url: 'https://enaca.org/rss/',                                     name: 'NACA (Asia-Pacific)',          lang: 'en' },
  { url: 'https://www.aquahoy.com/rss.xml',                            name: 'AquaHoy (Global)',             lang: 'en' },
  { url: 'https://globefish.org/rss.xml',                              name: 'FAO Globefish',                lang: 'en' },
  { url: 'https://www.intrafish.com/rss',                              name: 'IntraFish',                    lang: 'en' },
  { url: 'https://www.globalseafood.org/feed/',                        name: 'Global Seafood Alliance',      lang: 'en' },
  { url: 'https://www.nationalfisherman.com/feed/',                    name: 'National Fisherman (US)',       lang: 'en' },
  { url: 'https://www.aquaculturemagazine.com/feed/',                  name: 'Aquaculture Magazine',         lang: 'en' },
  { url: 'https://www.worldfishing.net/feed/',                         name: 'World Fishing & Aquaculture',  lang: 'en' },

  // ── Global · Import/Export & Trade ──────────────────────────────────────
  { url: 'https://www.seafoodwatch.org/rss/news',                      name: 'Seafood Watch (Trade)',        lang: 'en' },
  { url: 'https://www.foodnavigator.com/rss/topic/seafood',            name: 'Food Navigator Seafood',      lang: 'en' },
  { url: 'https://www.just-food.com/rss/',                             name: 'Just Food (Trade)',            lang: 'en' },
  { url: 'https://www.intrafish.com/rss/shrimp',                       name: 'IntraFish Shrimp',            lang: 'en' },
  { url: 'https://www.seafoodtradeintell.com/feed/',                   name: 'Seafood Trade Intelligence',  lang: 'en' },
  { url: 'https://www.fishupdate.com/feed/',                           name: 'Fish Update (Trade)',          lang: 'en' },
  { url: 'https://www.fis.com/fis/worldnews/rss.asp',                 name: 'FIS World News',               lang: 'en' },
  { url: 'https://ec.europa.eu/fisheries/rss/news_en.rss',            name: 'EU Fisheries Policy',         lang: 'en' },
  { url: 'https://www.usda.gov/rss/latest-releases.xml',              name: 'USDA (US Shrimp Trade)',      lang: 'en' },
  { url: 'https://www.noaa.gov/rss.xml',                              name: 'NOAA Fisheries',               lang: 'en' },
  { url: 'https://www.fas.usda.gov/data/rss.xml',                     name: 'USDA FAS Trade Data',         lang: 'en' },
  { url: 'https://nfi.org/feed/',                                      name: 'NFI (US Seafood Importers)',  lang: 'en' },
  { url: 'https://www.eumofa.eu/rss',                                  name: 'EUMOFA (EU Market)',          lang: 'en' },
  { url: 'https://www.fao.org/fishery/rss/en',                        name: 'FAO Fishery',                  lang: 'en' },
  { url: 'https://www.seafoodlegacy.com/feed/',                        name: 'Seafood Legacy (JP Trade)',   lang: 'en' },

  // ── Thai · ภาษาไทย ───────────────────────────────────────────────────────
  { url: 'https://www.nationthailand.com/rss/news',                   name: 'Nation Thailand News',         lang: 'en' },
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
  { url: 'https://www.abc.net.au/news/rural/rss.xml',                name: 'ABC Rural Australia',           lang: 'en' },

  // ── Global · Confirmed Additional ────────────────────────────────────────
  { url: 'https://www.intrafish.com/feed',                           name: 'IntraFish (main)',               lang: 'en' },
  { url: 'https://www.intrafish.com/rss_aquaculture',               name: 'IntraFish Aquaculture',          lang: 'en' },
  { url: 'https://www.undercurrentnews.com/feeds/',                  name: 'Undercurrent News Feed',        lang: 'en' },
  { url: 'https://aquaculturemag.com/feed',                          name: 'Aquaculture Magazine',          lang: 'en' },
  { url: 'https://www.globalseafood.org/advocate/feed',              name: 'Global Seafood Alliance',       lang: 'en' },
  { url: 'https://weareaquaculture.com/feed/',                       name: 'WeAreAquaculture',              lang: 'en' },
  { url: 'https://news.mongabay.com/category/seafood/feed/',         name: 'Mongabay Seafood',              lang: 'en' },
  { url: 'https://www.asc-aqua.org/feed/',                           name: 'ASC Aquaculture',               lang: 'en' },
  { url: 'https://www.aquafeed.com/feed',                            name: 'Aquafeed.com',                  lang: 'en' },
  { url: 'https://shrimpalliance.com/feed/',                         name: 'Southern Shrimp Alliance (US)', lang: 'en' },
  { url: 'https://www.aboutseafood.com/feed/',                       name: 'NFI Seafood (US)',              lang: 'en' },
  { url: 'https://worldfishcenter.org/feed',                         name: 'WorldFish Center',              lang: 'en' },
  { url: 'https://www.frontiersin.org/journals/aquaculture/rss',    name: 'Frontiers Aquaculture',         lang: 'en' },
  { url: 'https://onlinelibrary.wiley.com/feed/17535131/most-recent', name: 'Reviews in Aquaculture',      lang: 'en' },

  // ── Thailand · Additional ─────────────────────────────────────────────────
  { url: 'https://www.bangkokpost.com/rss/data/business.xml',        name: 'Bangkok Post Business',        lang: 'en' },
  { url: 'https://www.nationthailand.com/rss',                       name: 'Nation Thailand',              lang: 'en' },

  // ── Vietnam · Additional ──────────────────────────────────────────────────
  { url: 'https://vietfishmagazine.com/feed',                        name: 'Vietfish Magazine',             lang: 'vi' },
  { url: 'https://nongnghiep.vn/main-rss.html',                     name: 'Nong Nghiep VN (main)',         lang: 'vi' },

  // ── Ecuador · Additional ──────────────────────────────────────────────────
  { url: 'https://www.cna-ecuador.com/category/noticias-general/feed/', name: 'CNA Ecuador Official',     lang: 'es' },
  { url: 'https://www.agrolatam.com/feed/',                          name: 'Agrolatam Ecuador',            lang: 'es' },

  // ── Brazil · Additional ───────────────────────────────────────────────────
  { url: 'https://panoramadaaquicultura.com.br/feed/',               name: 'Panorama da Aquicultura (BR)', lang: 'pt' },
  { url: 'https://aquaculturebrasil.com.br/feed/',                   name: 'AquacultureBrasil',            lang: 'pt' },
  { url: 'https://abccam.com.br/feed/',                              name: 'ABCC Camarão Brasil',           lang: 'pt' },
  { url: 'https://brasil.mongabay.com/feed/',                        name: 'Mongabay Brasil',              lang: 'pt' },

  // ── Philippines · Additional ──────────────────────────────────────────────
  { url: 'https://www.seafdec.org.ph/feed/',                         name: 'SEAFDEC AQD Philippines',      lang: 'en' },
  { url: 'https://business.inquirer.net/feed',                       name: 'Inquirer Business (PH)',       lang: 'en' },
  { url: 'https://www.bworldonline.com/feed/',                       name: 'BusinessWorld Philippines',    lang: 'en' },
  { url: 'https://mb.com.ph/category/agriculture/feed/',             name: 'Manila Bulletin Agri',         lang: 'en' },

  // ── Myanmar · Additional ──────────────────────────────────────────────────
  { url: 'https://www.irrawaddy.com/feed',                           name: 'The Irrawaddy Myanmar',        lang: 'en' },
  { url: 'https://www.frontiermyanmar.net/en/feed',                  name: 'Frontier Myanmar',             lang: 'en' },

  // ── Japan · Additional ────────────────────────────────────────────────────
  { url: 'https://www.maff.go.jp/j/press/index.rss',                name: 'MAFF Japan Ministry',          lang: 'ja' },
  { url: 'https://www3.nhk.or.jp/nhkworld/en/news/rss/economy.xml', name: 'NHK World Economy',            lang: 'en' },
  { url: 'https://www.japantimes.co.jp/feed/',                       name: 'Japan Times',                  lang: 'en' },

  // ── Korea · Additional ────────────────────────────────────────────────────
  { url: 'https://en.yna.co.kr/RSS/economy.xml',                    name: 'Yonhap Economy Korea',         lang: 'en' },
  { url: 'https://www.koreaherald.com/rss/economy.xml',             name: 'Korea Herald Economy',          lang: 'en' },
  { url: 'https://koreajoongangdaily.joins.com/feed/',               name: 'Korea JoongAng Daily',         lang: 'en' },

  // ── Bangladesh · Additional ───────────────────────────────────────────────
  { url: 'https://www.thedailystar.net/rss.xml',                    name: 'Daily Star Bangladesh',         lang: 'en' },
  { url: 'https://www.tbsnews.net/rss.xml',                         name: 'TBS News Bangladesh',           lang: 'en' },
  { url: 'https://www.prothomalo.com/feed',                          name: 'Prothom Alo Bangladesh',       lang: 'bn' },

  // ── Malaysia · Additional ─────────────────────────────────────────────────
  { url: 'https://www.nst.com.my/news/feed',                         name: 'New Straits Times Malaysia',   lang: 'en' },
  { url: 'https://www.bernama.com/en/rss/',                          name: 'Bernama Malaysia',             lang: 'en' },

  // ── India · Additional ────────────────────────────────────────────────────
  { url: 'https://india.mongabay.com/feed/',                         name: 'Mongabay India',               lang: 'en' },

  // ── Indonesia · Additional ────────────────────────────────────────────────
  { url: 'https://www.mongabay.co.id/feed/',                         name: 'Mongabay Indonesia',           lang: 'id' },
];

const AQUA_KEYWORDS = [
  // English — shrimp-specific
  'shrimp','prawn','vannamei','penaeus','litopenaeus','monodon','kuruma prawn',
  'ems','wssv','white spot syndrome','ehp','ahpnd','vibrio','wfs','ihhnv','yhd',
  'necrotizing hepatopancreatitis','running mortality syndrome','acute hepatopancreatic',
  'shrimp farm','shrimp pond','shrimp hatchery','shrimp feed',
  'shrimp export','shrimp import','shrimp trade','shrimp tariff','shrimp quota',
  'shrimp price','shrimp production','shrimp disease','shrimp harvest','shrimp mortality',
  'shrimp market','shrimp supply','shrimp demand','shrimp ban','shrimp duty',
  'postlarva','nauplii','broodstock','shrimp breeding','shrimp pathogen',
  // Thai
  'กุ้ง','โรคกุ้ง','ฟาร์มกุ้ง','บ่อกุ้ง','กุ้งขาว','กุ้งกุลาดำ',
  'ตัวอ่อนกุ้ง','กุ้งแวนนาไม','ลูกกุ้ง','พันธุ์กุ้ง',
  'ส่งออกกุ้ง','นำเข้ากุ้ง','ราคากุ้ง','ตลาดกุ้ง','กุ้งส่งออก','ภาษีกุ้ง',
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

function decodeHtml(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

// Strip complete tags + any truncated trailing tag fragment (e.g. summary cut mid-attribute)
function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/<[^>]*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRSS(xml, sourceName) {
  // Reject HTML pages masquerading as RSS
  const trimmed = xml.trimStart();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<!doctype')) return [];
  if (!trimmed.includes('<item>') && !trimmed.includes('<entry>')) return [];

  const items = [];
  const rx = /(<item>[\s\S]*?<\/item>|<entry>[\s\S]*?<\/entry>)/gi;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = block.match(new RegExp(`<${tag}[\\s][^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>|<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      // Google News encodes HTML as entities — strip tags again AFTER decoding
      return r ? stripHtml(decodeHtml(stripHtml(r[1] || r[2] || ''))) : '';
    };
    const linkM = block.match(/<link[^>]+href=["']([^"']+)["']/i)
      || block.match(/<link>([^<]+)<\/link>/i);
    const title = get('title');
    if (title) items.push({
      title, url: linkM ? linkM[1].trim() : '',
      summary: (get('description') || get('summary') || get('content')).slice(0, 300),
      pubDate: get('pubDate') || get('published') || get('updated') || get('dc:date') || '',
      source: sourceName,
    });
  }
  return items;
}

function catLabel(cat) {
  return { industry:'🌏 อุตสาหกรรม', regulation:'📋 กฎระเบียบ', research:'🔬 งานวิจัย', disease:'🦠 โรคสัตว์น้ำ', trade:'📦 นำเข้า/ส่งออก' }[cat] || '🌏 อุตสาหกรรม';
}

function guessCategory(title, summary) {
  const t = `${title} ${summary}`.toLowerCase();
  if (/disease|virus|bacteria|pathogen|wssv|ehp|ems|outbreak|mortality|ระบาด|โรค/.test(t)) return 'disease';
  if (/import|export|tariff|quota|\bprice\b|ราคา|ส่งออก|นำเข้า|xuất khẩu|ekspor|exportac/.test(t)) return 'trade';
  if (/regulation|law|ban|standard|certification|fda|restriction|กฎหมาย/.test(t)) return 'regulation';
  if (/research|study|trial|technology|genome|vaccine|วิจัย|nghiên cứu/.test(t)) return 'research';
  return 'industry';
}


async function updateNews() {
  const dataPath = path.join(__dirname, 'news-data.json');
  const today = new Date().toISOString().slice(0, 10);

  // 1. Fetch all RSS feeds
  console.log(`📡 ดึง RSS จาก ${RSS_SOURCES.length} แหล่ง...`);
  const feedResults = await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, name, lang }) => {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OneAquacultureBot/2.0; +https://oneaquaculture.com)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const items = parseRSS(await r.text(), name);
      return items.slice(0, 5).map(it => ({ ...it, lang: lang || 'en' }));
    })
  );

  let ok = 0, fail = 0, items = [];
  feedResults.forEach((r) => {
    if (r.status === 'fulfilled') { ok++; items.push(...r.value); }
    else fail++;
  });
  console.log(`  ✓ ${ok} แหล่งตอบ  ✗ ${fail} แหล่ง timeout/error  → ${items.length} items รวม`);

  // 2. Load existing shrimp articles (dedup + purge non-shrimp)
  let existingArticles = [];
  if (fs.existsSync(dataPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      existingArticles = (existing.articles || []).filter(a => {
        if (a.isSample) return false;
        const text = `${a.title || ''} ${a.titleTH || ''} ${a.summary || ''}`;
        return AQUA_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
      });
      // Clean any raw HTML that older versions let through into stored fields
      existingArticles.forEach(a => {
        if (a.summary) a.summary = stripHtml(a.summary);
        if (a.titleTH) a.titleTH = stripHtml(a.titleTH);
      });
    } catch {}
  }
  const existingUrls = new Set(existingArticles.map(a => a.url).filter(Boolean));
  console.log(`  📂 บทความเดิม: ${existingArticles.length}`);

  // 3. Filter: shrimp keyword match + not already stored + dedup within batch by URL
  const seenUrls = new Set();
  const relevant = items.filter(it => {
    if (!it.url || !it.title) return false;
    if (existingUrls.has(it.url)) return false;
    if (seenUrls.has(it.url)) return false;  // dedup across feeds in same batch
    if (!AQUA_KEYWORDS.some(kw => `${it.title} ${it.summary}`.toLowerCase().includes(kw.toLowerCase()))) return false;
    seenUrls.add(it.url);
    return true;
  });
  relevant.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

  // Balance: no single language > 40% of batch
  const MAX_BATCH = 30, MAX_PER_LANG = Math.ceil(MAX_BATCH * 0.4);
  const langCount = {};
  const top = [];
  for (const it of relevant) {
    const l = it.lang || 'en';
    langCount[l] = (langCount[l] || 0) + 1;
    if (langCount[l] <= MAX_PER_LANG) top.push(it);
    if (top.length >= MAX_BATCH) break;
  }
  console.log(`\n🦐 ใหม่: ${relevant.length}  → batch ${top.length}  lang: ${JSON.stringify(langCount)}`);

  const cutoff90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const saveMerged = (newArts) => {
    const merged = [...newArts, ...existingArticles]
      .filter(a => (a.date || '9999') >= cutoff90)
      .slice(0, 300);
    fs.writeFileSync(dataPath, JSON.stringify({ articles: merged, lastUpdated: new Date().toISOString(), translated: true }, null, 2));
    return merged.length;
  };

  // Repair pass: stored articles whose translation failed in a past run (still not Thai)
  const hasThai = (s) => /[฀-๿]/.test(s || '');
  const needsFix = existingArticles.filter(a => !hasThai(a.titleTH) || (a.summary && !hasThai(a.summary)));
  if (needsFix.length) console.log(`🔧 บทความเดิมที่ยังไม่เป็นไทย: ${needsFix.length} — แปลซ่อมในรอบนี้`);

  if (!top.length && !needsFix.length) {
    // No new articles — update timestamp so startup doesn't re-run immediately
    console.log('⚠️  ไม่มีบทความใหม่ — อัปเดต timestamp เท่านั้น');
    saveMerged([]);
    return;
  }

  const buildArticle = (it, ai = {}) => {
    const cat = ['industry','regulation','research','disease','trade'].includes(ai.category)
      ? ai.category : guessCategory(it.title, it.summary);
    return {
      title: it.title, titleTH: ai.titleTH || it.title,
      source: it.source, url: it.url, lang: it.lang || 'en',
      date: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : today,
      firstSeen: today,
      category: cat, categoryLabel: catLabel(cat),
      summary: ai.summary || it.summary || '',
      country: (ai.country && ai.country !== 'null') ? ai.country : null,
    };
  };

  // 4. Save English fallback immediately (page never shows empty)
  const total0 = saveMerged(top.map(it => buildArticle(it)));
  console.log(`💾 fallback บันทึกแล้ว (${top.length} ใหม่ รวม ${total0}) — กำลัง AI แปล...`);

  // 5. AI translate + country extract (best-effort — fallback already saved)
  try {
    const fixItems = needsFix.map(a => ({ title: a.title, source: a.source, pubDate: a.date || '', summary: a.summary || '' }));
    const batch = [...top, ...fixItems];

    // Chunked calls — one giant request times out; a failed chunk only loses its own articles
    const CHUNK = 15;
    const byIdx = {};
    for (let start = 0; start < batch.length; start += CHUNK) {
      const chunk = batch.slice(start, start + CHUNK);
      const listed = chunk.map((it, i) =>
        `[${start + i}] title: ${it.title}\nsource: ${it.source}\ndate: ${it.pubDate||''}\nexcerpt: ${(it.summary||'').slice(0,200)}`
      ).join('\n---\n');
      try {
        const msg = await client.chat.completions.create({
          model: 'google/gemini-2.5-flash-lite',
          max_tokens: 6000,
          messages: [{ role: 'user', content:
`Shrimp aquaculture news analyst. ${chunk.length} articles in MIXED LANGUAGES.
Return ONLY valid JSON array, no markdown. The array MUST contain one object for EVERY article, using the exact idx shown in [brackets].

Schema: {"idx":N,"titleTH":"Thai title","category":"industry|regulation|research|disease|trade","summary":"2-sentence Thai summary","country":"Thai name or null"}

CRITICAL: "titleTH" and "summary" MUST be written in THAI LANGUAGE (ภาษาไทย) for every article, regardless of the article's original language (English, Vietnamese, Chinese, Spanish, ...). Never write them in the article's own language.

category: disease=โรค/pathogen/virus/outbreak; regulation=law/ban/standard/certification; trade=import/export/tariff/quota/price/price index; research=study/vaccine/technology; else industry
country (event location, NOT source): ไทย เวียดนาม อินโดนีเซีย เอกวาดอร์ อินเดีย จีน บังกลาเทศ ฟิลิปปินส์ มาเลเซีย เมียนมา ญี่ปุ่น เกาหลี ออสเตรเลีย บราซิล เม็กซิโก สหรัฐอเมริกา สหภาพยุโรป — null if global

Articles:
${listed}` }]
        }, { timeout: 90_000, maxRetries: 2 });

        const raw = msg.choices[0].message.content.trim();
        const parsed = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
        parsed.forEach(p => { byIdx[p.idx] = p; });
        console.log(`  🈯 แปล chunk ${start}-${start + chunk.length - 1} สำเร็จ (${parsed.length})`);
      } catch (chunkErr) {
        console.warn(`  ⚠️ chunk ${start}-${start + chunk.length - 1} ล้มเหลว: ${chunkErr.message.slice(0, 60)}`);
      }
    }
    const newArticles = top.map((it, i) => buildArticle(it, byIdx[i] || {}));
    // Apply repairs to stored articles (mutates entries inside existingArticles)
    let fixed = 0;
    needsFix.forEach((a, j) => {
      const ai = byIdx[top.length + j];
      if (!ai) return;
      if (hasThai(ai.titleTH)) { a.titleTH = stripHtml(ai.titleTH); fixed++; }
      if (hasThai(ai.summary)) a.summary = stripHtml(ai.summary);
    });
    if (needsFix.length) console.log(`🔧 แปลซ่อมสำเร็จ ${fixed}/${needsFix.length}`);
    const total = saveMerged(newArticles);
    console.log(`\n✅ เสร็จ — ${newArticles.length} ใหม่  รวม ${total} บทความ`);
    newArticles.slice(0, 5).forEach((a, i) =>
      console.log(`  ${i+1}. [${a.country||'?'}][${a.category}] ${a.titleTH.slice(0,60)}`));
  } catch (aiErr) {
    console.warn(`⚠️  AI error (${aiErr.message.slice(0,60)}) — ใช้ English fallback แทน`);
  }
}

updateNews().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
