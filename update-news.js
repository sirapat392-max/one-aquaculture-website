require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function searchNews(query) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(query);
    const url = `https://serpapi.com/search.json?q=${encoded}&tbm=nws&hl=th&gl=th&api_key=${process.env.SERP_API_KEY || ''}`;
    // Fallback: return empty if no SERP key
    resolve([]);
  });
}

async function updateNews() {
  console.log('🤖 AI กำลังหาข่าวใหม่...');

  const prompt = `คุณคือ AI ที่ช่วยคัดสรรข่าวสารสำหรับบริษัท ONE AQUACULTURE PRODUCT
ซึ่งเชี่ยวชาญด้านจุลินทรีย์ปรับสภาพน้ำและผลิตภัณฑ์ชีวภาพสำหรับการเพาะเลี้ยงสัตว์น้ำ

สร้างรายการข่าว/บทความที่น่าเชื่อถือและเกี่ยวข้องกับธุรกิจของบริษัท ประกอบด้วย:
1. ข่าวกฎระเบียบ กรมประมง / HAZDOF
2. งานวิจัยโปรไบโอติกส์ในสัตว์น้ำ
3. ข่าวอุตสาหกรรม aquaculture ไทยและโลก
4. ความรู้โรคกุ้ง/ปลา

ตอบเป็น JSON array ดังนี้:
[
  {
    "title": "หัวข้อบทความ (ภาษาไทยหรืออังกฤษตามต้นฉบับ)",
    "titleTH": "หัวข้อภาษาไทย",
    "source": "ชื่อแหล่งข่าว",
    "url": "URL จริงที่เชื่อถือได้",
    "date": "ปี พ.ศ. หรือ ค.ศ.",
    "category": "regulation | research | industry | disease",
    "categoryLabel": "ป้าย (เช่น ⚖️ กฎระเบียบ)",
    "summary": "สรุปสั้น 2-3 ประโยคภาษาไทย",
    "confidence": "high | medium"
  }
]

สำคัญ: ใส่เฉพาะ URL ที่มีอยู่จริงและน่าเชื่อถือ เช่น fisheries.go.th, frontiersin.org, seafoodsource.com, pubmed, ราชกิจจาฯ`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = response.content[0].text;
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('ไม่พบ JSON ในคำตอบ');

    const articles = JSON.parse(jsonMatch[0]);
    const newsData = {
      articles: articles.filter(a => a.confidence === 'high' || a.confidence === 'medium'),
      lastUpdated: new Date().toISOString(),
      updatedBy: 'AI (claude-sonnet-4-6)'
    };

    fs.writeFileSync(
      path.join(__dirname, 'news-data.json'),
      JSON.stringify(newsData, null, 2),
      'utf-8'
    );

    console.log(`✅ อัปเดตข่าวสำเร็จ ${newsData.articles.length} บทความ`);
    console.log(`📅 เวลา: ${new Date().toLocaleString('th-TH')}`);
    newsData.articles.forEach((a, i) => console.log(`  ${i+1}. [${a.category}] ${a.titleTH || a.title}`));
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', err.message);
  }
}

updateNews();
