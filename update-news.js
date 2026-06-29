require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SERP_KEY = process.env.SERP_API_KEY || '';

function serpSearch(query) {
  return new Promise((resolve) => {
    if (!SERP_KEY) { resolve([]); return; }
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&tbm=nws&hl=th&gl=th&num=5&api_key=${SERP_KEY}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve((json.news_results || []).map(r => ({
            title: r.title,
            source: r.source,
            url: r.link,
            date: r.date,
            snippet: r.snippet,
          })));
        } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

async function updateNews() {
  console.log('🔍 กำลังค้นข่าวจาก SERP API...');

  const queries = [
    'โรคกุ้ง EHP WSSV 2025',
    'aquaculture Thailand shrimp 2025',
    'จุลินทรีย์โปรไบโอติก สัตว์น้ำ',
    'กรมประมง ข่าว 2025',
    'shrimp disease outbreak Asia 2025',
  ];

  const rawResults = await Promise.all(queries.map(serpSearch));
  const allRaw = rawResults.flat();
  console.log(`📰 พบข่าวดิบ ${allRaw.length} รายการ`);

  const prompt = `คุณคือนักวิเคราะห์ข่าวด้านอุตสาหกรรมเพาะเลี้ยงสัตว์น้ำ

นี่คือผลการค้นหาข่าวล่าสุด:
${JSON.stringify(allRaw, null, 2)}

เลือกและสรุปข่าวที่เกี่ยวข้องกับ:
- โรคกุ้ง/ปลา และการป้องกัน
- จุลินทรีย์และโปรไบโอติกสำหรับสัตว์น้ำ
- กฎระเบียบกรมประมง / มาตรฐานอาหารสัตว์น้ำ
- อุตสาหกรรม aquaculture ไทยและเอเชีย
- ความยั่งยืนในการเพาะเลี้ยงสัตว์น้ำ

${allRaw.length === 0 ? 'ไม่มีข้อมูล SERP — สร้างข่าวสำคัญที่น่าเชื่อถือจากความรู้ที่มี (ใส่เฉพาะ URL ที่มีอยู่จริงจากแหล่งที่เชื่อถือได้อย่าง fisheries.go.th, fao.org, pubmed.ncbi.nlm.nih.gov, seafoodsource.com, thefishsite.com)' : ''}

ตอบเป็น JSON array (5-8 รายการ):
[
  {
    "title": "หัวข้อภาษาต้นฉบับ",
    "titleTH": "หัวข้อภาษาไทย",
    "source": "ชื่อแหล่งข่าว",
    "url": "URL จริง",
    "date": "วันที่",
    "category": "regulation | research | industry | disease",
    "categoryLabel": "ป้าย เช่น ⚖️ กฎระเบียบ | 🔬 งานวิจัย | 🌏 อุตสาหกรรม | 🦐 โรคสัตว์น้ำ",
    "summary": "สรุปภาษาไทย 2-3 ประโยค"
  }
]

ตอบเฉพาะ JSON ไม่ต้องมีคำอธิบายเพิ่ม`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].text;
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('ไม่พบ JSON ในคำตอบ');

    const articles = JSON.parse(match[0]);
    const newsData = {
      articles,
      lastUpdated: new Date().toISOString(),
      updatedBy: 'AI (claude-sonnet-4-6) + SERP API',
      source: allRaw.length > 0 ? 'real-search' : 'ai-generated',
    };

    fs.writeFileSync(
      path.join(__dirname, 'news-data.json'),
      JSON.stringify(newsData, null, 2),
      'utf-8'
    );

    console.log(`✅ อัปเดตข่าวสำเร็จ ${articles.length} บทความ`);
    console.log(`📅 ${new Date().toLocaleString('th-TH')}`);
    articles.forEach((a, i) => console.log(`  ${i + 1}. [${a.category}] ${a.titleTH || a.title}`));
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', err.message);
    process.exit(1);
  }
}

updateNews();
