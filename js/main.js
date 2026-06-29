// ─── SHARED NAV & FOOTER INJECTION ────────────────────────────────────────
const currentPage = location.pathname.split('/').pop() || 'index.html';

function navHTML() {
  const links = [
    { href: 'index.html',        label: 'หน้าแรก' },
    { href: 'products.html',     label: 'ผลิตภัณฑ์' },
    { href: 'ai-diagnosis.html', label: '🤖 วิเคราะห์โรค' },
    { href: 'news.html',         label: 'ข่าวสาร' },
    { href: 'about.html',        label: 'เกี่ยวกับเรา' },
    { href: 'contact.html',      label: 'ติดต่อ' },
  ];
  return `
<nav>
  <a href="index.html" class="nav-logo">
    <div class="nav-logo-icon"><img src="logo.jpg" alt="ONE logo"></div>
    <div class="nav-logo-text">
      <strong>ONE AQUACULTURE</strong>
      <span>บริษัท วัน อควาคัลเจอร์ โปรดัคท์ จำกัด</span>
    </div>
  </a>
  <ul class="nav-links" id="navLinks">
    ${links.map(l => `<li><a href="${l.href}" class="${currentPage===l.href?'active':''}">${l.label}</a></li>`).join('')}
  </ul>
  <a href="contact.html" class="nav-cta" id="navCta">ปรึกษาผู้เชี่ยวชาญ</a>
  <button class="nav-hamburger" id="navHamburger" aria-label="เมนู">
    <span></span><span></span><span></span>
  </button>
</nav>`;
}

function footerHTML() {
  return `
<footer>
  <div class="footer-inner">
    <div class="footer-grid">
      <div>
        <div class="footer-logo">
          <div class="footer-logo-icon"><img src="logo.jpg" alt="ONE logo"></div>
          <div class="footer-logo-text"><strong>ONE AQUACULTURE PRODUCT</strong><span>บริษัท วัน อควาคัลเจอร์ โปรดัคท์ จำกัด</span></div>
        </div>
        <p class="footer-desc">ผลิตภัณฑ์เวชภัณฑ์สัตว์น้ำแบรนด์ตัวเอง ไว้วางใจโดยกว่า 100 ฟาร์ม ทั่วภาคใต้อ่าวไทย อันดามัน และภาคกลาง</p>
        <a href="https://www.facebook.com/profile.php?id=100075538372879" target="_blank" style="display:inline-flex;align-items:center;gap:7px;color:#90CAF9;font-size:12px;font-weight:600;text-decoration:none;margin-top:10px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          Facebook · ONE Aquaculture Product
        </a>
      </div>
      <div class="footer-col">
        <h5>ผลิตภัณฑ์</h5>
        <ul>
          <li><a href="products.html#water">จุลินทรีย์ปรับสภาพน้ำ</a></li>
          <li><a href="products.html#feed">ผลิตภัณฑ์เสริมอาหาร</a></li>
          <li><a href="products.html#disease">ควบคุมโรค</a></li>
          <li><a href="products.html#soil">ปรับปรุงดินก้นบ่อ</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>บริการ</h5>
        <ul>
          <li><a href="ai-diagnosis.html">🤖 วิเคราะห์โรคกุ้ง AI</a></li>
          <li><a href="news.html">ข่าวสาร &amp; ความรู้</a></li>
          <li><a href="about.html">เกี่ยวกับเรา</a></li>
          <li><a href="contact.html">ติดต่อเรา</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>กฎระเบียบ</h5>
        <ul>
          <li><a href="https://www4.fisheries.go.th" target="_blank">กรมประมง</a></li>
          <li><a href="https://haz.fisheries.go.th" target="_blank">ระบบ HAZDOF</a></li>
          <li><a href="products.html#register">ทะเบียนวัตถุอันตราย</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2569 บริษัท วัน อควาคัลเจอร์ โปรดัคท์ จำกัด · All rights reserved.</p>
    </div>
  </div>
</footer>`;
}

document.addEventListener('DOMContentLoaded', () => {
  // Inject nav & footer
  document.body.insertAdjacentHTML('afterbegin', navHTML());
  document.body.insertAdjacentHTML('beforeend', footerHTML());

  // Mobile nav hamburger
  const ham = document.getElementById('navHamburger');
  const navLinksList = document.getElementById('navLinks');
  if (ham && navLinksList) {
    ham.addEventListener('click', () => {
      const isOpen = navLinksList.classList.toggle('mobile-open');
      ham.classList.toggle('open', isOpen);
    });
    // close on link click
    navLinksList.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinksList.classList.remove('mobile-open');
        ham.classList.remove('open');
      });
    });
  }

  // Scroll reveal
  const reveals = document.querySelectorAll('.reveal');
  const obs = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  reveals.forEach(el => obs.observe(el));
});

// API base URL — empty string = relative to current host (works local + production)
const API = '';

// SSE helper — streams AI response token by token
async function streamAI(endpoint, body, onToken, onDone) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.text) onToken(data.text);
        if (data.done) onDone();
      } catch {}
    }
  }
}
