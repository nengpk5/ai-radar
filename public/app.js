// public/app.js - AI & Tech News Radar Offline-First Engine

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
const searchInputEl = document.getElementById('searchInput');
const clearSearchBtnEl = document.getElementById('clearSearchBtn');
const refreshBtnEl = document.getElementById('refreshBtn');
const refreshIconEl = document.getElementById('refreshIcon');

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
      req.onsuccess = () => resolve(req.result || []);
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
    // Clear and batch re-insert
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

// Helper to resolve Source badge
function getSourceBadge(item) {
  const id = item.id || '';
  const url = item.url || '';
  if (id.startsWith('bsky_') || url.includes('bsky.app')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">🌐 Bluesky</span>`;
  }
  if (id.startsWith('hn_') || url.includes('ycombinator.com')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30 flex items-center gap-1">🔥 Hacker News</span>`;
  }
  if (id.startsWith('hf_') || url.includes('huggingface.co')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">🤗 Hugging Face</span>`;
  }
  if (id.startsWith('or_') || url.includes('openrouter.ai')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">🤖 OpenRouter</span>`;
  }
  if (id.startsWith('gn_') || url.includes('news.google.com') || url.includes('x.com')) {
    return `<span class="px-2 py-0.5 rounded-full font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">📰 X / Web</span>`;
  }
  return `<span class="px-2 py-0.5 rounded-full font-medium bg-gray-800 text-gray-300 border border-gray-700">📡 Web</span>`;
}

// 3. Render News Feed
function renderFeed() {
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

  itemsCountDisplayEl.textContent = `พบ ${filtered.length} รายการ (จากทั้งหมด ${allNews.length})`;

  if (filtered.length === 0) {
    newsFeedEl.innerHTML = '';
    emptyStateEl.classList.remove('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');

  const cardsHtml = filtered.map((item) => {
    // Score Badge colors
    let scoreBadgeStyle = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    let scoreIcon = '⚡';
    if (item.score >= 9) {
      scoreBadgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-500/20';
      scoreIcon = '🔥';
    } else if (item.score >= 8) {
      scoreBadgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20';
      scoreIcon = '⭐';
    } else if (item.score >= 7) {
      scoreBadgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      scoreIcon = '✨';
    }

    // Category styling
    let catBadgeColor = 'bg-gray-800 text-gray-300 border-gray-700';
    if (item.category === 'Model Release') catBadgeColor = 'bg-purple-950/60 text-purple-300 border-purple-800/50';
    if (item.category === 'Dev Tool') catBadgeColor = 'bg-blue-950/60 text-blue-300 border-blue-800/50';
    if (item.category === 'Benchmark') catBadgeColor = 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50';
    if (item.category === 'Research') catBadgeColor = 'bg-amber-950/60 text-amber-300 border-amber-800/50';

    const sourceBadge = getSourceBadge(item);

    return `
      <article class="p-4 rounded-xl bg-radarCard border border-radarBorder hover:border-emerald-500/40 transition-all shadow-lg hover:shadow-emerald-950/20 space-y-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold border ${scoreBadgeStyle}">
              ${scoreIcon} ${item.score || 5}/10
            </span>
            ${sourceBadge}
            <span class="px-2 py-0.5 rounded-full font-medium bg-radarBorder/80 text-gray-200 border border-gray-700/60">
              ${escapeHtml(item.vendor || 'AI')}
            </span>
            <span class="px-2 py-0.5 rounded-full font-medium border ${catBadgeColor}">
              ${escapeHtml(item.category || 'Update')}
            </span>
          </div>
          <span class="text-[11px] text-gray-400 whitespace-nowrap shrink-0">
            ${formatTimeAgo(item.timestamp)}
          </span>
        </div>

        <div>
          <h2 class="text-sm md:text-base font-bold text-white leading-snug hover:text-emerald-300 transition-colors">
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="hover:underline flex items-baseline gap-1.5">
              <span>${escapeHtml(item.title_th || 'อัปเดตข่าว AI ใหม่')}</span>
            </a>
          </h2>
        </div>

        <p class="text-xs md:text-sm text-gray-300 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-radarBorder/40">
          ${escapeHtml(item.summary_th || '')}
        </p>

        <div class="pt-1 flex items-center justify-between text-xs">
          <a 
            href="${escapeHtml(item.url)}" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          >
            <span>อ่านต้นฉบับ</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </article>
    `;
  }).join('');

  newsFeedEl.innerHTML = cardsHtml;
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
    syncStatusEl.textContent = 'กำลังดึงข้อมูลล่าสุด...';
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

      syncStatusEl.textContent = 'ข้อมูลสดล่าสุด (Online)';
      if (allNews[0] && allNews[0].timestamp) {
        lastUpdatedDisplayEl.textContent = `อัปเดต: ${new Date(allNews[0].timestamp).toLocaleTimeString('th-TH')}`;
      }
    } else {
      if (allNews.length === 0) {
        itemsCountDisplayEl.textContent = 'ยังไม่มีข้อมูลข่าว (กำลังรอรอบวิเคราะห์)';
      }
      syncStatusEl.textContent = 'เชื่อมต่อแล้ว';
    }
  } catch (err) {
    console.warn('Network fetch error, running offline:', err);
    syncStatusEl.textContent = 'โหมดออฟไลน์ (จากแคชในเครื่อง)';
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
        b.className = 'vendor-pill px-3 py-1.5 rounded-full font-medium transition-all bg-radarCard border border-radarBorder text-gray-300 hover:border-emerald-500/40 whitespace-nowrap';
      });
      btn.className = 'vendor-pill px-3 py-1.5 rounded-full font-medium transition-all bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 whitespace-nowrap font-semibold';
      activeVendor = btn.dataset.vendor;
      renderFeed();
    });
  });

  // Score pills
  document.querySelectorAll('.score-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.score-pill').forEach((b) => {
        b.className = 'score-pill px-3 py-1.5 rounded-full font-medium transition-all bg-radarCard border border-radarBorder text-gray-300 whitespace-nowrap';
      });
      btn.className = 'score-pill px-3 py-1.5 rounded-full font-medium transition-all bg-emerald-500 text-gray-950 font-semibold shadow-sm shadow-emerald-500/20 whitespace-nowrap';
      activeMinScore = btn.dataset.scoreFilter === '8' ? 8 : 5;
      renderFeed();
    });
  });

  // Search input
  searchInputEl.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    if (searchQuery) {
      clearSearchBtnEl.classList.remove('hidden');
    } else {
      clearSearchBtnEl.classList.add('hidden');
    }
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
  });
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
    syncStatusEl.textContent = 'โหลดจากหน่วยความจำแคช';
    renderFeed();
  }

  // Background network update
  fetchLatestNews(false);
}

document.addEventListener('DOMContentLoaded', init);
