// public/app.js - AI & Tech News Radar Futuristic Offline-First Engine

const DB_NAME = 'AIRadarDB';
const DB_VERSION = 1;
const STORE_NAME = 'newsStore';

// In-memory state
let allNews = [];
let activeVendor = 'all';
let activeMinScore = 5;
let searchQuery = '';

// DOM Elements
const newsFeedEl = document.getElementById('newsFeed');
const emptyStateEl = document.getElementById('emptyState');
const syncStatusEl = document.getElementById('syncStatus');
const itemsCountDisplayEl = document.getElementById('itemsCountDisplay');
const lastUpdatedDisplayEl = document.getElementById('lastUpdatedDisplay');
const hudTotalCountEl = document.getElementById('hudTotalCount');
const hudBreakingCountEl = document.getElementById('hudBreakingCount');
const searchInputEl = document.getElementById('searchInput');
const clearSearchBtnEl = document.getElementById('clearSearchBtn');
const refreshBtnEl = document.getElementById('refreshBtn');
const refreshIconEl = document.getElementById('refreshIcon');
const scrollProgressEl = document.getElementById('scrollProgress');
const scrollTopBtnEl = document.getElementById('scrollTopBtn');

// 1. IndexedDB Helper Functions
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedNewsFromDB() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        // Keep newest first when loading from IndexedDB
        rows.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        resolve(rows);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB read error:', err);
    return [];
  }
}

async function saveNewsToDB(items) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const item of items) {
      store.put(item);
    }
  } catch (err) {
    console.warn('IndexedDB write error:', err);
  }
}

// 2. Relative time formatter (Thai)
function formatTimeAgo(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'เมื่อสักครู่';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ชม. ที่แล้ว`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `${diffDays} วันที่แล้ว`;

  return date.toLocaleDateString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Helper: Resolve Source Badge
function getSourceBadge(item) {
  const id = item.id || '';
  const url = item.url || '';
  if (id.startsWith('bsky_') || url.includes('bsky.app')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-sky-500/15 text-sky-300 border border-sky-400/30 inline-flex items-center gap-1">🌐 Bluesky</span>`;
  }
  if (id.startsWith('hn_') || url.includes('ycombinator.com')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-orange-500/15 text-orange-300 border border-orange-400/30 inline-flex items-center gap-1">🔥 Hacker News</span>`;
  }
  if (id.startsWith('hf_') || url.includes('huggingface.co')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-300 border border-amber-400/30 inline-flex items-center gap-1">🤗 Hugging Face</span>`;
  }
  if (id.startsWith('or_') || url.includes('openrouter.ai')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-violet-500/15 text-violet-300 border border-violet-400/30 inline-flex items-center gap-1">🤖 OpenRouter</span>`;
  }
  if (id.startsWith('gn_') || url.includes('news.google.com') || url.includes('x.com')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-300 border border-blue-400/30 inline-flex items-center gap-1">📰 X / Web</span>`;
  }
  return `<span class="px-2 py-0.5 rounded-full font-medium bg-gray-800/80 text-gray-300 border border-gray-700">📡 Web</span>`;
}

// Helper: Mini Signal Strength Bars (5 segments for score 5..10)
function renderSignalMeter(score) {
  const s = Math.max(1, Math.min(10, Number(score) || 5));
  const activeBars = Math.ceil(s / 2);
  let barColor = 'bg-cyan-400';
  if (s >= 9) barColor = 'bg-rose-400 shadow-[0_0_6px_#fb7185]';
  else if (s >= 8) barColor = 'bg-amber-400 shadow-[0_0_6px_#fbbf24]';
  else if (s >= 7) barColor = 'bg-emerald-400 shadow-[0_0_6px_#34d399]';

  let html = '<span class="inline-flex items-end gap-[2px] h-3 ml-1" title="Signal Impact">';
  for (let i = 1; i <= 5; i++) {
    const h = 4 + i * 1.6;
    const cls = i <= activeBars ? barColor : 'bg-gray-700/70';
    html += `<span class="w-[2.5px] rounded-full ${cls}" style="height:${h}px"></span>`;
  }
  html += '</span>';
  return html;
}

function updateHudStats() {
  if (hudTotalCountEl) hudTotalCountEl.textContent = allNews.length;
  if (hudBreakingCountEl) {
    hudBreakingCountEl.textContent = allNews.filter((n) => (n.score || 0) >= 8).length;
  }
}

// 3. Render News Feed with Staggered Entrance & Spotlight
function renderFeed() {
  updateHudStats();

  const filtered = allNews.filter((item) => {
    const matchVendor = activeVendor === 'all' || (item.vendor && item.vendor.toLowerCase() === activeVendor.toLowerCase());
    const matchScore = (item.score || 0) >= activeMinScore;
    if (!matchVendor || !matchScore) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const title = (item.title_th || '').toLowerCase();
    const summary = (item.summary_th || '').toLowerCase();
    const vendor = (item.vendor || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    const id = (item.id || '').toLowerCase();
    return title.includes(q) || summary.includes(q) || vendor.includes(q) || cat.includes(q) || id.includes(q);
  });

  itemsCountDisplayEl.textContent = `SHOWING ${filtered.length} / ${allNews.length} SIGNALS`;

  if (filtered.length === 0) {
    newsFeedEl.innerHTML = '';
    emptyStateEl.classList.remove('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');

  const cardsHtml = filtered.map((item, idx) => {
    const score = item.score || 5;
    const isBreaking = score >= 8;

    // Score Badge colors
    let scoreBadgeStyle = 'bg-cyan-500/15 text-cyan-300 border-cyan-400/35';
    let scoreIcon = '⚡';
    let cardAccentBorder = 'border-radarBorder hover:border-emerald-400/45';

    if (score >= 9) {
      scoreBadgeStyle = 'bg-rose-500/20 text-rose-200 border-rose-400/50 shadow-[0_0_12px_rgba(244,63,94,0.25)]';
      scoreIcon = '🔥';
      cardAccentBorder = 'border-rose-500/35 hover:border-rose-400/60 breaking-scan';
    } else if (score >= 8) {
      scoreBadgeStyle = 'bg-amber-500/20 text-amber-200 border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]';
      scoreIcon = '⭐';
      cardAccentBorder = 'border-amber-500/30 hover:border-amber-400/55 breaking-scan';
    } else if (score >= 7) {
      scoreBadgeStyle = 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40';
      scoreIcon = '✨';
    }

    // Category styling
    let catBadgeColor = 'bg-gray-800/80 text-gray-300 border-gray-700/70';
    if (item.category === 'Model Release') catBadgeColor = 'bg-purple-950/60 text-purple-300 border-purple-500/35';
    if (item.category === 'Dev Tool') catBadgeColor = 'bg-blue-950/60 text-blue-300 border-blue-500/35';
    if (item.category === 'Benchmark') catBadgeColor = 'bg-emerald-950/60 text-emerald-300 border-emerald-500/35';
    if (item.category === 'Research') catBadgeColor = 'bg-amber-950/60 text-amber-300 border-amber-500/35';

    const sourceBadge = getSourceBadge(item);
    const delayMs = Math.min(idx * 45, 450);

    return `
      <article 
        class="news-card rounded-2xl bg-radarCard/85 backdrop-blur-md border ${cardAccentBorder} p-4 md:p-5 shadow-xl space-y-3"
        style="animation-delay: ${delayMs}ms"
      >
        ${isBreaking ? `<div class="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full ${score >= 9 ? 'bg-gradient-to-b from-rose-400 to-amber-400 shadow-[0_0_10px_#fb7185]' : 'bg-gradient-to-b from-amber-400 to-emerald-400 shadow-[0_0_10px_#fbbf24]'}"></div>` : ''}

        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span class="font-mono inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold border ${scoreBadgeStyle}">
              ${scoreIcon} ${score}/10 ${renderSignalMeter(score)}
            </span>
            ${sourceBadge}
            <span class="px-2 py-0.5 rounded-full font-medium bg-white/5 text-gray-200 border border-white/10">
              ${escapeHtml(item.vendor || 'AI')}
            </span>
            <span class="px-2 py-0.5 rounded-full font-medium border ${catBadgeColor}">
              ${escapeHtml(item.category || 'Update')}
            </span>
          </div>
          <span class="font-mono text-[10px] md:text-[11px] text-gray-400 whitespace-nowrap shrink-0 pt-0.5">
            ${formatTimeAgo(item.timestamp)}
          </span>
        </div>

        <div>
          <h2 class="text-sm md:text-[17px] font-bold text-white leading-snug tracking-tight">
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="hover:text-emerald-300 transition-colors inline-flex items-baseline gap-1.5">
              <span>${escapeHtml(item.title_th || 'อัปเดตข่าว AI ใหม่')}</span>
            </a>
          </h2>
        </div>

        <p class="text-xs md:text-sm text-gray-300/95 leading-relaxed bg-black/30 p-3 rounded-xl border border-white/5">
          ${escapeHtml(item.summary_th || '')}
        </p>

        ${item.deep_dive_th ? `
        <div id="deepdive-${escapeHtml(item.id)}" class="accordion-grid">
          <div class="accordion-inner">
            <div class="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/40 via-black/40 to-cyan-950/30 border border-emerald-400/30 space-y-2.5 text-xs text-gray-200 leading-relaxed">
              <div class="font-mono font-semibold text-emerald-300 text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                TECHNICAL DEEP-DIVE // AI ENGINEER BRIEF
              </div>
              <div class="p-2 rounded-lg bg-black/25 border border-white/5"><span class="text-cyan-300 font-semibold">⚙️ จุดเด่นทางเทคนิค:</span> ${escapeHtml(item.deep_dive_th.highlights)}</div>
              <div class="p-2 rounded-lg bg-black/25 border border-white/5"><span class="text-amber-300 font-semibold">⚖️ ข้อดี / ข้อควรระวัง:</span> ${escapeHtml(item.deep_dive_th.pros_cons)}</div>
              <div class="p-2 rounded-lg bg-black/25 border border-white/5"><span class="text-emerald-300 font-semibold">🚀 แนวทางเอาไปใช้จริง:</span> ${escapeHtml(item.deep_dive_th.actionable)}</div>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="pt-1 flex items-center justify-between gap-2 text-xs">
          <a 
            href="${escapeHtml(item.url)}" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="group inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
          >
            <span>อ่านต้นฉบับ</span>
            <svg class="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          ${item.deep_dive_th ? `
          <button
            type="button"
            data-deepdive-target="deepdive-${escapeHtml(item.id)}"
            class="deepdive-toggle-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 hover:bg-emerald-500/25 hover:shadow-[0_0_14px_rgba(16,185,129,0.28)] font-semibold transition-all active:scale-95"
          >
            <span>🔍 อ่านวิเคราะห์เจาะลึก</span>
          </button>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');

  newsFeedEl.innerHTML = cardsHtml;

  // Bind Smooth Deep-Dive Accordions
  newsFeedEl.querySelectorAll('.deepdive-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.deepdiveTarget);
      if (!target) return;
      const isOpen = target.classList.toggle('open');
      btn.innerHTML = isOpen ? '<span>ซ่อนวิเคราะห์เจาะลึก ▴</span>' : '<span>🔍 อ่านวิเคราะห์เจาะลึก</span>';
    });
  });

  // Bind Interactive Cursor Spotlight on Desktop Cards
  newsFeedEl.querySelectorAll('.news-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 4. Background Sync / Fetch from GitHub Raw or ./data/news.json
async function fetchLatestNews(isManual = false) {
  if (isManual) {
    refreshIconEl.classList.add('animate-spin');
    syncStatusEl.textContent = 'SYNCING LIVE FEEDS...';
  }

  const githubRawUrl = `https://raw.githubusercontent.com/nengpk5/ai-radar/main/public/data/news.json?t=${Date.now()}`;
  const localUrl = `./data/news.json?t=${Date.now()}`;

  try {
    let res;
    try {
      res = await fetch(githubRawUrl);
      if (!res.ok) throw new Error(`GitHub Raw HTTP ${res.status}`);
    } catch (ghErr) {
      console.warn('GitHub Raw fetch failed, falling back to local news.json:', ghErr.message);
      res = await fetch(localUrl);
      if (!res.ok) throw new Error(`Local news.json HTTP ${res.status}`);
    }

    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
      allNews = data;
      await saveNewsToDB(allNews);
      renderFeed();

      syncStatusEl.textContent = 'ONLINE // REAL-TIME FEED ACTIVE';
      if (allNews[0] && allNews[0].timestamp) {
        lastUpdatedDisplayEl.textContent = `UPDATED ${new Date(allNews[0].timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
      }
    } else {
      if (allNews.length === 0) {
        itemsCountDisplayEl.textContent = 'NO SIGNALS YET';
      }
      syncStatusEl.textContent = 'CONNECTED';
    }
  } catch (err) {
    console.warn('Network fetch error, running offline:', err);
    syncStatusEl.textContent = 'OFFLINE // SERVING LOCAL CACHE';
  } finally {
    if (isManual) {
      setTimeout(() => {
        refreshIconEl.classList.remove('animate-spin');
      }, 500);
    }
  }
}

// 5. Setup UI Event Listeners
function setupListeners() {
  // Vendor pills
  document.querySelectorAll('.vendor-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vendor-pill').forEach((b) => {
        b.className = 'vendor-pill px-3 py-1.5 rounded-full font-medium transition-all duration-200 bg-radarCard/80 border border-radarBorder text-gray-300 hover:border-emerald-400/40 hover:text-white whitespace-nowrap active:scale-95';
      });
      btn.className = 'vendor-pill px-3 py-1.5 rounded-full font-semibold transition-all duration-200 bg-emerald-500/20 text-emerald-300 border border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.2)] whitespace-nowrap active:scale-95';
      activeVendor = btn.dataset.vendor;
      renderFeed();
    });
  });

  // Score pills
  document.querySelectorAll('.score-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.score-pill').forEach((b) => {
        b.className = 'score-pill px-3.5 py-1.5 rounded-full font-medium transition-all duration-200 bg-radarCard/80 border border-radarBorder text-gray-300 hover:border-amber-400/50 hover:text-amber-300 whitespace-nowrap flex items-center gap-1.5 active:scale-95';
      });
      btn.className = 'score-pill px-3.5 py-1.5 rounded-full font-semibold transition-all duration-200 bg-gradient-to-r from-emerald-400 to-cyan-400 text-gray-950 shadow-[0_0_16px_rgba(16,185,129,0.35)] whitespace-nowrap flex items-center gap-1.5 active:scale-95';
      activeMinScore = btn.dataset.scoreFilter === '8' ? 8 : 5;
      renderFeed();
    });
  });

  // Search input
  searchInputEl.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    clearSearchBtnEl.classList.toggle('hidden', !searchQuery);
    renderFeed();
  });

  clearSearchBtnEl.addEventListener('click', () => {
    searchInputEl.value = '';
    searchQuery = '';
    clearSearchBtnEl.classList.add('hidden');
    renderFeed();
  });

  // Manual refresh
  refreshBtnEl.addEventListener('click', () => {
    fetchLatestNews(true);
    fetchDigests();
  });

  // Daily Briefing Smooth Accordion
  const toggleDailyBtn = document.getElementById('toggleDailyBriefBtn');
  const dailyAccordion = document.getElementById('dailyBriefAccordion');
  const toggleDailyLabel = document.getElementById('toggleDailyLabel');
  const toggleDailyChevron = document.getElementById('toggleDailyChevron');
  if (toggleDailyBtn && dailyAccordion) {
    toggleDailyBtn.addEventListener('click', () => {
      const isOpen = dailyAccordion.classList.toggle('open');
      if (toggleDailyLabel) toggleDailyLabel.textContent = isOpen ? 'ซ่อนรายละเอียด' : 'ดู 3 เรื่องเด่น';
      if (toggleDailyChevron) toggleDailyChevron.classList.toggle('rotate-180', isOpen);
    });
  }

  // Weekly Report Modal controls + Escape key
  const weeklyBtn = document.getElementById('weeklyReportBtn');
  const weeklyModal = document.getElementById('weeklyModal');
  const closeWeeklyBtn = document.getElementById('closeWeeklyModalBtn');
  if (weeklyBtn && weeklyModal) {
    weeklyBtn.addEventListener('click', () => weeklyModal.classList.remove('hidden'));
    closeWeeklyBtn?.addEventListener('click', () => weeklyModal.classList.add('hidden'));
    weeklyModal.addEventListener('click', (e) => {
      if (e.target === weeklyModal) weeklyModal.classList.add('hidden');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') weeklyModal.classList.add('hidden');
    });
  }

  // Scroll Progress Bar + Back to Top Button
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    if (scrollProgressEl) scrollProgressEl.style.width = `${pct}%`;

    if (scrollTopBtnEl) {
      const show = scrollTop > 320;
      scrollTopBtnEl.classList.toggle('opacity-0', !show);
      scrollTopBtnEl.classList.toggle('translate-y-4', !show);
      scrollTopBtnEl.classList.toggle('pointer-events-none', !show);
    }
  }, { passive: true });

  scrollTopBtnEl?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// 5.5 Daily Briefing & Weekly Report Helpers
async function fetchJsonWithFallback(filename) {
  const ghUrl = `https://raw.githubusercontent.com/nengpk5/ai-radar/main/public/data/${filename}?t=${Date.now()}`;
  const localUrl = `./data/${filename}?t=${Date.now()}`;
  try {
    const res = await fetch(ghUrl);
    if (res.ok) return await res.json();
  } catch { /* fallback below */ }
  const localRes = await fetch(localUrl);
  if (!localRes.ok) throw new Error(`HTTP ${localRes.status}`);
  return await localRes.json();
}

function renderDailyBrief(brief) {
  if (!brief || !brief.headline_th) return;
  const card = document.getElementById('dailyBriefCard');
  const dateEl = document.getElementById('dailyBriefDate');
  const headlineEl = document.getElementById('dailyBriefHeadline');
  const trendEl = document.getElementById('dailyBriefTrend');
  const bodyEl = document.getElementById('dailyBriefBody');
  if (!card || !bodyEl) return;

  dateEl.textContent = brief.date_th || '';
  headlineEl.textContent = brief.headline_th;
  trendEl.textContent = brief.trend_th || '';

  const stories = Array.isArray(brief.top_stories) ? brief.top_stories : [];
  bodyEl.innerHTML = stories.map((s, idx) => `
    <div class="p-3 rounded-xl bg-black/35 border border-white/10 hover:border-emerald-400/40 transition-colors space-y-1">
      <div class="flex items-center justify-between gap-2">
        <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="text-xs md:text-sm font-bold text-emerald-300 hover:underline">
          ${idx + 1}. ${escapeHtml(s.title_th)}
        </a>
        <span class="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300 shrink-0">${escapeHtml(s.vendor || 'AI')}</span>
      </div>
      <p class="text-xs text-gray-300/90 leading-relaxed">${escapeHtml(s.why_it_matters || '')}</p>
    </div>
  `).join('');

  card.classList.remove('hidden');
}

function renderWeeklyReport(report) {
  if (!report || !report.executive_summary_th) return;
  const btn = document.getElementById('weeklyReportBtn');
  const periodEl = document.getElementById('weeklyPeriod');
  const contentEl = document.getElementById('weeklyModalContent');
  if (!btn || !contentEl) return;

  periodEl.textContent = report.period_th || 'สรุปภาพรวมรายสัปดาห์';

  const modelsHtml = (report.top_models || []).map((m) => `
    <div class="p-3.5 rounded-xl bg-black/35 border border-white/10 hover:border-purple-400/40 transition-colors space-y-1.5">
      <div class="flex items-center justify-between gap-2">
        <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer" class="font-bold text-emerald-300 hover:underline text-xs md:text-sm">${escapeHtml(m.name)}</a>
        <span class="font-mono text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-400/35">${escapeHtml(m.vendor || '')}</span>
      </div>
      <p class="text-xs text-gray-300 leading-relaxed">${escapeHtml(m.takeaway_th || '')}</p>
    </div>
  `).join('');

  const toolsHtml = (report.top_tools || []).map((t) => `
    <div class="p-3.5 rounded-xl bg-black/35 border border-white/10 hover:border-cyan-400/40 transition-colors space-y-1">
      <a href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer" class="font-bold text-cyan-300 hover:underline text-xs md:text-sm">${escapeHtml(t.name)}</a>
      <p class="text-xs text-gray-300 leading-relaxed">${escapeHtml(t.takeaway_th || '')}</p>
    </div>
  `).join('');

  const vendorsHtml = (report.vendor_highlights || []).map((v) => `
    <div class="p-3 rounded-xl bg-black/30 border border-white/10 hover:border-emerald-400/35 transition-colors">
      <div class="font-display text-xs font-bold text-white mb-1">${escapeHtml(v.vendor)}</div>
      <p class="text-xs text-gray-300/90 leading-relaxed">${escapeHtml(v.summary_th)}</p>
    </div>
  `).join('');

  contentEl.innerHTML = `
    <div class="p-4 rounded-xl bg-gradient-to-r from-cyan-950/50 to-emerald-950/40 border border-cyan-400/30 text-xs md:text-sm text-gray-100 leading-relaxed">
      ${escapeHtml(report.executive_summary_th)}
    </div>
    ${modelsHtml ? `<div class="space-y-2.5"><h3 class="font-mono text-[11px] font-bold uppercase tracking-widest text-purple-300">🤖 โมเดลเด่นประจำสัปดาห์</h3>${modelsHtml}</div>` : ''}
    ${toolsHtml ? `<div class="space-y-2.5"><h3 class="font-mono text-[11px] font-bold uppercase tracking-widest text-cyan-300">🛠️ เครื่องมือ & Dev Tool น่าลอง</h3>${toolsHtml}</div>` : ''}
    ${vendorsHtml ? `<div class="space-y-2.5"><h3 class="font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-300">🏢 ความเคลื่อนไหวแยกตามค่าย</h3><div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">${vendorsHtml}</div></div>` : ''}
  `;

  btn.classList.remove('hidden');
}

async function fetchDigests() {
  try {
    const cachedDaily = localStorage.getItem('ai_radar_daily_brief');
    if (cachedDaily) renderDailyBrief(JSON.parse(cachedDaily));
    const cachedWeekly = localStorage.getItem('ai_radar_weekly_report');
    if (cachedWeekly) renderWeeklyReport(JSON.parse(cachedWeekly));
  } catch { /* ignore cache errors */ }

  fetchJsonWithFallback('daily_brief.json')
    .then((data) => {
      localStorage.setItem('ai_radar_daily_brief', JSON.stringify(data));
      renderDailyBrief(data);
    })
    .catch(() => {});

  fetchJsonWithFallback('weekly_report.json')
    .then((data) => {
      localStorage.setItem('ai_radar_weekly_report', JSON.stringify(data));
      renderWeeklyReport(data);
    })
    .catch(() => {});
}

// 6. Register Service Worker
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }
}

// 7. Initialization Flow
async function init() {
  setupListeners();
  registerSW();

  // Instant render from IndexedDB cache
  const cached = await getCachedNewsFromDB();
  if (cached && cached.length > 0) {
    allNews = cached;
    syncStatusEl.textContent = 'CACHE LOADED // SYNCING...';
    renderFeed();
  }

  // Background network update
  fetchLatestNews(false);
  fetchDigests();
}

document.addEventListener('DOMContentLoaded', init);
