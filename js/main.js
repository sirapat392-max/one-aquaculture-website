// ─── SHARED NAV & FOOTER INJECTION ────────────────────────────────────────
// pathname without .html for active-link matching; handles /guides/ems → 'guides'
const _pathParts = location.pathname.replace(/\.html$/, '').split('/').filter(Boolean);
const currentPage = _pathParts[_pathParts.length - 1] || 'index';
const currentSection = _pathParts[0] || 'index';

function langSwitcherHTML() {
  return `<div class="lang-switcher">
    <button class="lang-btn" data-lang="th" onclick="setLang('th')">TH</button>
    <button class="lang-btn" data-lang="en" onclick="setLang('en')">EN</button>
    <button class="lang-btn" data-lang="vi" onclick="setLang('vi')">VI</button>
    <button class="lang-btn" data-lang="zh" onclick="setLang('zh')">ZH</button>
  </div>`;
}

function navHTML() {
  const links = [
    { href: '/',                id: 'index',           key: 'nav.home',      icon: '🏠' },
    { href: '/products',        id: 'products',        key: 'nav.products',  icon: '🦐' },
    { href: '/shrimp-price',    id: 'shrimp-price',    key: 'nav.price',     icon: '📈' },
    { href: '/ai-diagnosis',    id: 'ai-diagnosis',    key: 'nav.diagnosis', icon: '🔬' },
    { href: '/farm-calculator', id: 'farm-calculator', key: 'nav.farm',      icon: '🧮' },
    { href: '/guides',          id: 'guides',          key: 'nav.guides',    icon: '📚' },
    { href: '/news',            id: 'news',            key: 'nav.news',      icon: '📰' },
    { href: '/about',           id: 'about',           key: 'nav.about',     icon: 'ℹ️' },
    { href: '/contact',         id: 'contact',         key: 'nav.contact',   icon: '💬' },
  ];
  const isActive = (id) => currentPage === id || currentSection === id;
  return `
<nav>
  <a href="/" class="nav-logo">
    <div class="nav-logo-icon"><img src="/logo.jpg" alt="ONE logo" width="42" height="42" loading="eager"></div>
    <div class="nav-logo-text">
      <strong>ONE AQUACULTURE</strong>
      <span>บริษัท วัน อควาคัลเจอร์ โปรดัคท์ จำกัด</span>
    </div>
  </a>
  <ul class="nav-links" id="navLinks">
    ${links.map(l => `<li><a href="${l.href}" class="${isActive(l.id)?'active':''}" data-i18n="${l.key}">${t(l.key)}</a></li>`).join('')}
  </ul>
  ${langSwitcherHTML()}
  <a href="/ai-diagnosis" class="nav-cta" id="navCta" data-i18n="nav.cta">${t('nav.cta')}</a>
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
          <div class="footer-logo-icon"><img src="/logo.jpg" alt="ONE logo" width="36" height="36" loading="lazy"></div>
          <div class="footer-logo-text"><strong>ONE AQUACULTURE PRODUCT</strong><span>บริษัท วัน อควาคัลเจอร์ โปรดัคท์ จำกัด</span></div>
        </div>
        <p class="footer-desc" data-i18n="footer.desc">${t('footer.desc')}</p>
        <a href="https://www.facebook.com/profile.php?id=100075538372879" target="_blank" style="display:inline-flex;align-items:center;gap:7px;color:#90CAF9;font-size:12px;font-weight:600;text-decoration:none;margin-top:10px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          <span data-i18n="footer.follow">${t('footer.follow')}</span>
        </a>
        <a href="https://onebiowater.com" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;color:#C9956C;font-size:12px;font-weight:700;text-decoration:none;margin-top:10px;">
          💧 <span>เว็บในเครือ: ONE Bio Water · บำบัดน้ำด้วยจุลินทรีย์ ↗</span>
        </a>
      </div>
      <div class="footer-col">
        <h5 data-i18n="footer.col1">${t('footer.col1')}</h5>
        <ul>
          <li><a href="/products#water"   data-i18n="footer.p1.1">${t('footer.p1.1')}</a></li>
          <li><a href="/products#feed"    data-i18n="footer.p1.2">${t('footer.p1.2')}</a></li>
          <li><a href="/products#disease" data-i18n="footer.p1.3">${t('footer.p1.3')}</a></li>
          <li><a href="/products#soil"    data-i18n="footer.p1.4">${t('footer.p1.4')}</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5 data-i18n="footer.col2">${t('footer.col2')}</h5>
        <ul>
          <li><a href="/ai-diagnosis" data-i18n="footer.s1.1">${t('footer.s1.1')}</a></li>
          <li><a href="/news"         data-i18n="footer.s1.2">${t('footer.s1.2')}</a></li>
          <li><a href="/about"        data-i18n="footer.s1.3">${t('footer.s1.3')}</a></li>
          <li><a href="/contact"      data-i18n="footer.s1.4">${t('footer.s1.4')}</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5 data-i18n="footer.col3">${t('footer.col3')}</h5>
        <ul>
          <li><a href="https://www4.fisheries.go.th" target="_blank" data-i18n="footer.r1.1">${t('footer.r1.1')}</a></li>
          <li><a href="https://haz.fisheries.go.th"  target="_blank" data-i18n="footer.r1.2">${t('footer.r1.2')}</a></li>
          <li><a href="/products#register" data-i18n="footer.r1.3">${t('footer.r1.3')}</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p data-i18n="footer.copy">${t('footer.copy')}</p>
      <a href="/vet-review" class="vet-secret-btn" title="Vet">🔒</a>
    </div>
  </div>
</footer>`;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('nav')) {
    document.body.insertAdjacentHTML('afterbegin', navHTML());
  }
  if (!document.querySelector('footer')) {
    document.body.insertAdjacentHTML('beforeend', footerHTML());
  }

  // apply any remaining data-i18n on page content
  if (typeof applyI18n === 'function') applyI18n();

  // Mobile nav hamburger
  const ham = document.getElementById('navHamburger');
  const navLinksList = document.getElementById('navLinks');
  if (ham && navLinksList) {
    const closeNav = () => {
      navLinksList.classList.remove('mobile-open');
      ham.classList.remove('open');
    };
    ham.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navLinksList.classList.toggle('mobile-open');
      ham.classList.toggle('open', isOpen);
    });
    navLinksList.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));
    document.addEventListener('click', (e) => {
      if (navLinksList.classList.contains('mobile-open') && !navLinksList.contains(e.target) && e.target !== ham) {
        closeNav();
      }
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

// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// API base URL — empty string = relative to current host (works local + production)
const API = '';

// SSE helper — streams AI response token by token
async function streamAI(endpoint, body, onToken, onDone) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
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
