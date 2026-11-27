// public/model-radar.js — OpenRouter Model Radar view for AI RADAR
// Reads a Google Apps Script Web App JSON endpoint via JSONP (Apps Script emits no CORS headers).
// Offline-first: localStorage cache rendered instantly, then background revalidate.
// Zero runtime dependencies. Does NOT touch the existing News Radar logic in app.js.

/* ==========================================================================
   CONFIG — the single source of truth for the Model Radar endpoint.
   Deploy Code.gs as a Web app (Execute as: Me, Who has access: Anyone) and
   paste the URL ending in /exec below. Leave the placeholder to run DEMO mode.
   ========================================================================== */
const MODEL_RADAR_API_URL = '<PASTE_EXEC_URL>';

const MR_CACHE_KEY = 'ai_radar_model_radar_v1';
const MR_DEMO = '<PASTE_EXEC_URL>'; // when still unchanged -> demo/mock mode

// ---- State -----------------------------------------------------------------
const mrState = {
  payload: null,
  source: 'none', // none | cache | live | demo
  tier: 'All',
  hermesOnly: false,
  query: '',
  sort: 'rank', // rank | price | new | context
  subTab: 'rankings', // rankings | presets
};

// ---- Element refs (resolved lazily; view may not exist) ---------------------
function $(id) { return document.getElementById(id); }

// ============================================================================
// 1. JSONP transport (Apps Script CORS workaround) + cache
// ============================================================================
let mrCbSeq = 0;
function jsonp(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const cbName = '__mrCb_' + (++mrCbSeq) + '_' + Date.now();
    const tag = document.createElement('script');
    let done = false;
    const cleanup = () => {
      clearTimeout(timer);
      try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    };
    const timer = setTimeout(() => { if (done) return; done = true; cleanup(); reject(new Error('jsonp timeout')); }, timeoutMs);
    window[cbName] = (data) => { if (done) return; done = true; cleanup(); resolve(data); };
    tag.onerror = () => { if (done) return; done = true; cleanup(); reject(new Error('jsonp network error')); };
    tag.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName + '&_=' + Date.now();
    document.body.appendChild(tag);
  });
}

function mrReadCache() {
  try {
    const raw = localStorage.getItem(MR_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && obj.payload) return obj;
  } catch (_) { /* ignore */ }
  return null;
}

function mrWriteCache(payload) {
  try {
    localStorage.setItem(MR_CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }));
  } catch (_) { /* quota / private mode — ignore */ }
}

const MR_URL_READY = () => {
  const u = typeof MODEL_RADAR_API_URL === 'string' ? MODEL_RADAR_API_URL.trim() : '';
  return /^https?:\/\//.test(u) && u !== MR_DEMO;
};

// ============================================================================
// 2. DEMO payload (used only until a real /exec URL is configured)
// ============================================================================
function mrDemoPayload() {
  const now = new Date().toISOString();
  return {
    updated_at: now,
    rankings_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    attribution: 'Source: OpenRouter (openrouter.ai/rankings), Licensed under CC BY 4.0.',
    summary: { total: 5, free: 2, value: 2, flagship: 1, hermes_ready: 4, new_releases: 2 },
    models: [
      { model_id: 'deepseek/deepseek-chat-v3.1:free', model_name: 'DeepSeek V3.1 (free)', provider: 'DeepSeek', tier: 'Free', rank_openrouter: 'Top #1 Free', input_per_1m_usd: 0, output_per_1m_usd: 0, blended_3to1_usd: 0, context_k: 128, tool_calling: 'Yes', hermes_ready: 'Yes', best_for: 'NEW • Tools', released_date: '2026-11-20', source_url: 'https://openrouter.ai/deepseek/deepseek-chat-v3.1:free' },
      { model_id: 'meta-llama/llama-3.3-70b-instruct:free', model_name: 'Llama 3.3 70B Instruct (free)', provider: 'Meta', tier: 'Free', rank_openrouter: 'Top #3 Free', input_per_1m_usd: 0, output_per_1m_usd: 0, blended_3to1_usd: 0, context_k: 131, tool_calling: 'Yes', hermes_ready: 'Yes', best_for: 'Tools', released_date: '2026-09-02', source_url: 'https://openrouter.ai/meta-llama/llama-3.3-70b-instruct:free' },
      { model_id: 'qwen/qwen3-235b-a22b', model_name: 'Qwen3 235B A22B', provider: 'Qwen', tier: 'Value', rank_openrouter: '#7 Overall', input_per_1m_usd: 0.2, output_per_1m_usd: 0.6, blended_3to1_usd: 0.3, context_k: 131, tool_calling: 'Yes', hermes_ready: 'Yes', best_for: 'Tools', released_date: '2026-06-15', source_url: 'https://openrouter.ai/qwen/qwen3-235b-a22b' },
      { model_id: 'google/gemini-2.5-flash', model_name: 'Gemini 2.5 Flash', provider: 'Google', tier: 'Value', rank_openrouter: '#2 Overall', input_per_1m_usd: 0.3, output_per_1m_usd: 2.5, blended_3to1_usd: 0.85, context_k: 1048, tool_calling: 'Yes', hermes_ready: 'Yes', best_for: 'NEW • Tools • Long-Ctx', released_date: '2026-11-10', source_url: 'https://openrouter.ai/google/gemini-2.5-flash' },
      { model_id: 'anthropic/claude-sonnet-4.6', model_name: 'Claude Sonnet 4.6', provider: 'Anthropic', tier: 'Flagship', rank_openrouter: '#1 Overall', input_per_1m_usd: 3, output_per_1m_usd: 15, blended_3to1_usd: 6, context_k: 200, tool_calling: 'Yes', hermes_ready: 'Yes', best_for: 'Tools', released_date: '2026-10-28', source_url: 'https://openrouter.ai/anthropic/claude-sonnet-4.6' },
    ],
    rankings: [
      { date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), list_type: 'Overall Token Volume', rank: 1, model_permaslug: 'anthropic/claude-sonnet-4.6', display_name: 'Claude Sonnet 4.6', provider: 'Anthropic', tier: 'Flagship', source_url: 'https://openrouter.ai/anthropic/claude-sonnet-4.6' },
      { date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), list_type: 'Overall Token Volume', rank: 2, model_permaslug: 'google/gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', provider: 'Google', tier: 'Value', source_url: 'https://openrouter.ai/google/gemini-2.5-flash' },
      { date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), list_type: 'Free Models (Daily)', rank: 1, model_permaslug: 'deepseek/deepseek-chat-v3.1:free', display_name: 'DeepSeek V3.1 (free)', provider: 'DeepSeek', tier: 'Free', source_url: 'https://openrouter.ai/deepseek/deepseek-chat-v3.1:free' },
    ],
    hermes_presets: [
      { profile_name: 'everyday-value', use_case: 'งานทั่วไป เร็ว คุ้ม', primary_model_id: 'google/gemini-2.5-flash', fallback_model_id: 'qwen/qwen3-235b-a22b', routing_mode: 'balanced', cost_tier: 'value', notes: 'สลับอัตโนมัติเมื่อ rate limit' },
      { profile_name: 'zero-cost-free', use_case: 'ประหยัดสุด ใช้ตัวฟรี', primary_model_id: 'deepseek/deepseek-chat-v3.1:free', fallback_model_id: 'meta-llama/llama-3.3-70b-instruct:free', routing_mode: 'cheapest', cost_tier: 'free', notes: 'tool calling ครบ' },
    ],
  };
}

// ============================================================================
// 3. Formatting helpers
// ============================================================================
function mrEsc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function mrNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mrPrice(v) {
  const n = mrNum(v);
  if (n === null) return '—';
  if (n === 0) return 'FREE';
  if (n < 0.01) return '$' + n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  if (n < 1) return '$' + n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return '$' + (n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
}

function mrCtx(v) {
  const n = mrNum(v);
  if (n === null) return '—';
  return n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'M' : Math.round(n) + 'K';
}

function mrTierClass(tier) {
  switch ((tier || '').toLowerCase()) {
    case 'free': return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40';
    case 'value': return 'bg-cyan-500/15 text-cyan-300 border-cyan-400/40';
    case 'flagship': return 'bg-violet-500/15 text-violet-300 border-violet-400/40';
    default: return 'bg-gray-800/80 text-gray-300 border-gray-700';
  }
}

function mrTierLabel(tier) {
  switch ((tier || '').toLowerCase()) {
    case 'free': return 'ตัวฟรี';
    case 'value': return 'ตัวคุ้ม';
    case 'flagship': return 'ตัวแรง';
    default: return tier || '—';
  }
}

function mrTimeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return Math.floor(s / 60) + ' นาทีที่แล้ว';
  if (s < 86400) return Math.floor(s / 3600) + ' ชม. ที่แล้ว';
  return Math.floor(s / 86400) + ' วันที่แล้ว';
}

function mrIsNew(m) {
  const bf = String(m.best_for || '');
  if (/NEW/i.test(bf)) return true;
  const d = new Date(m.released_date);
  if (!isNaN(d.getTime())) return (Date.now() - d.getTime()) <= 14 * 86400000;
  return false;
}

function mrIsFree(m) {
  if ((m.tier || '').toLowerCase() === 'free') return true;
  if (String(m.model_id || '').endsWith(':free')) return true;
  return mrNum(m.input_per_1m_usd) === 0 && mrNum(m.output_per_1m_usd) === 0;
}

// ============================================================================
// 4. Toast + copy
// ============================================================================
let mrToastTimer = null;
function mrToast(msg, ok = true) {
  let el = $('mrToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mrToast';
    el.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold shadow-2xl transition-all duration-300 pointer-events-none opacity-0 translate-y-3';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold shadow-2xl transition-all duration-300 pointer-events-none ' +
    (ok ? 'bg-emerald-500/95 text-gray-950 border border-emerald-300/60' : 'bg-rose-500/95 text-white border border-rose-300/60');
  void el.offsetWidth;
  el.classList.remove('opacity-0', 'translate-y-3');
  clearTimeout(mrToastTimer);
  mrToastTimer = setTimeout(() => {
    el.classList.add('opacity-0', 'translate-y-3');
  }, 1600);
}

function mrCopy(text, label = 'คัดลอกแล้ว!') {
  const done = () => mrToast('✓ ' + label);
  const fail = () => mrToast('คัดลอกไม่สำเร็จ', false);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      mrFallbackCopy(text) ? done() : fail();
    });
  } else {
    mrFallbackCopy(text) ? done() : fail();
  }
}

function mrFallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) { return false; }
}

// ============================================================================
// 5. View switching (hash-routed: #news default | #models)
// ============================================================================
function mrSetView(view, pushHash = true) {
  const newsView = $('view-news');
  const modelsView = $('view-models');
  const tabNews = $('mrTabNews');
  const tabModels = $('mrTabModels');
  const newsTelemetry = $('newsTelemetryBar');
  const weeklyBtn = $('weeklyReportBtn');

  const isModels = view === 'models';
  if (newsView) newsView.classList.toggle('hidden', isModels);
  if (modelsView) modelsView.classList.toggle('hidden', !isModels);
  if (newsTelemetry) newsTelemetry.classList.toggle('hidden', isModels);
  if (weeklyBtn) weeklyBtn.classList.toggle('hidden', isModels);

  const activeSeg = 'flex-1 sm:flex-none text-center px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap';
  const inactiveSeg = activeSeg + ' text-gray-400 hover:text-white';
  const activeStyle = ' bg-gradient-to-r from-emerald-400 to-cyan-400 text-gray-950 shadow-[0_0_16px_rgba(16,185,129,0.35)]';
  if (tabNews) tabNews.className = (isModels ? inactiveSeg : activeSeg + activeStyle);
  if (tabModels) tabModels.className = (isModels ? activeSeg + activeStyle : inactiveSeg);

  if (pushHash) {
    const target = isModels ? '#models' : '#news';
    if (location.hash !== target) {
      try { history.replaceState(null, '', target); } catch (_) { location.hash = target; }
    }
  }
  if (isModels) mrInitView();
}

function mrViewFromHash() {
  return location.hash === '#models' ? 'models' : 'news';
}

// ============================================================================
// 6. Data load (cache-first → revalidate)
// ============================================================================
async function mrLoadData(forceManual = false) {
  const statusEl = $('mrSyncStatus');

  // 1. Render cache instantly
  const cached = mrReadCache();
  if (cached && !mrState.payload) {
    mrState.payload = cached.payload;
    mrState.source = 'cache';
    mrRenderAll();
    if (statusEl) statusEl.textContent = 'CACHE LOADED // SYNCING…';
  }

  // 2. No URL configured → demo
  if (!MR_URL_READY()) {
    if (!mrState.payload || mrState.source === 'demo') {
      mrState.payload = mrDemoPayload();
      mrState.source = 'demo';
      mrRenderAll();
    }
    if (statusEl) statusEl.textContent = 'DEMO MODE // ยังไม่ได้ใส่ /exec URL';
    if (forceManual) mrToast('ยังไม่ได้ใส่ URL จริง — แสดงข้อมูลตัวอย่าง', false);
    return;
  }

  // 3. Revalidate in background
  if (statusEl) statusEl.textContent = 'SYNCING LIVE…';
  try {
    const data = await jsonp(MODEL_RADAR_API_URL.trim());
    if (!data || (!Array.isArray(data.models) && !Array.isArray(data.rankings))) {
      throw new Error('payload รูปแบบไม่ถูกต้อง');
    }
    mrState.payload = data;
    mrState.source = 'live';
    mrWriteCache(data);
    mrRenderAll();
    if (statusEl) statusEl.textContent = 'LIVE // OpenRouter Radar';
  } catch (err) {
    console.warn('Model Radar fetch failed:', err);
    if (!mrState.payload) {
      // nothing cached → fall back to demo so the UI never goes blank
      mrState.payload = mrDemoPayload();
      mrState.source = 'demo';
      mrRenderAll();
      if (statusEl) statusEl.textContent = 'OFFLINE // แสดงข้อมูลตัวอย่าง';
    } else {
      if (statusEl) statusEl.textContent = 'OFFLINE // ใช้แคชเดิม';
    }
    mrShowBanner('ดึงข้อมูล Model Radar ไม่ได้ — กำลังแสดง' + (mrState.source === 'cache' ? 'ข้อมูลที่แคชไว้' : 'ข้อมูลตัวอย่าง'));
    if (forceManual) mrToast('ซิงก์ไม่สำเร็จ ใช้ข้อมูลเดิม', false);
  }
}

function mrShowBanner(text) {
  const el = $('mrFallbackBanner');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
}
function mrHideBanner() {
  const el = $('mrFallbackBanner');
  if (el) el.classList.add('hidden');
}

// ============================================================================
// 7. Rendering
// ============================================================================
function mrRenderAll() {
  const p = mrState.payload;
  if (!p) return;
  mrRenderKpis(p);
  mrRenderFiltersState();
  mrRenderModels();
  mrRenderRankings(p);
  mrRenderPresets(p);
  mrRenderFooter(p);
  if (p.updated_at) {
    const u = $('mrLastUpdated');
    if (u) u.textContent = mrTimeAgo(p.updated_at) + (p.rankings_date ? ' • rankings ' + p.rankings_date : '');
  }
}

function mrRenderKpis(p) {
  const s = p.summary || {};
  const models = Array.isArray(p.models) ? p.models : [];
  const newCount = mrNum(s.new_releases) !== null ? mrNum(s.new_releases) : models.filter(mrIsNew).length;
  const cards = [
    { label: 'ทั้งหมด', value: s.total != null ? s.total : models.length, accent: 'text-white' },
    { label: 'ตัวฟรี', value: s.free != null ? s.free : models.filter(mrIsFree).length, accent: 'text-emerald-300' },
    { label: 'ตัวคุ้ม', value: s.value != null ? s.value : 0, accent: 'text-cyan-300' },
    { label: 'ตัวแรง', value: s.flagship != null ? s.flagship : 0, accent: 'text-violet-300' },
    { label: 'ใหม่ (14d)', value: newCount, accent: 'text-amber-300' },
  ];
  const el = $('mrKpis');
  if (!el) return;
  el.innerHTML = cards.map((c) => `
    <div class="rounded-xl bg-radarCard/85 border border-radarBorder p-3 text-center">
      <div class="font-mono text-[10px] uppercase tracking-widest text-gray-500">${mrEsc(c.label)}</div>
      <div class="text-xl md:text-2xl font-bold ${c.accent} leading-tight">${mrEsc(c.value)}</div>
    </div>
  `).join('');
}

function mrRenderFiltersState() {
  document.querySelectorAll('[data-mr-tier]').forEach((btn) => {
    const on = btn.dataset.mrTier === mrState.tier;
    btn.className = 'mr-tier-pill px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 ' +
      (on ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-gray-950 shadow-[0_0_14px_rgba(16,185,129,0.35)]'
         : 'bg-radarCard/80 border border-radarBorder text-gray-300 hover:border-emerald-400/40 hover:text-white');
  });
  const toggle = $('mrHermesToggle');
  if (toggle) {
    toggle.className = 'w-9 h-5 rounded-full relative transition-colors duration-200 shrink-0 ' + (mrState.hermesOnly ? 'bg-emerald-500' : 'bg-gray-700');
    const knob = toggle.querySelector('span');
    if (knob) knob.className = 'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ' + (mrState.hermesOnly ? 'left-[18px]' : 'left-0.5');
  }
  const sort = $('mrSort');
  if (sort && sort.value !== mrState.sort) sort.value = mrState.sort;
}

function mrFilteredModels() {
  const p = mrState.payload;
  const models = Array.isArray(p.models) ? p.models.slice() : [];
  let list = models.filter((m) => {
    if (mrState.tier === 'Free' && !mrIsFree(m)) return false;
    if (mrState.tier === 'Value' && (m.tier || '').toLowerCase() !== 'value') return false;
    if (mrState.tier === 'Flagship' && (m.tier || '').toLowerCase() !== 'flagship') return false;
    if (mrState.tier === 'New' && !mrIsNew(m)) return false;
    if (mrState.hermesOnly && !/^yes$/i.test(String(m.hermes_ready || ''))) return false;
    if (mrState.query) {
      const q = mrState.query.toLowerCase();
      const hay = (String(m.model_name || '') + ' ' + String(m.model_id || '') + ' ' + String(m.provider || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const rankVal = (m) => {
    const m1 = String(m.rank_openrouter || '').match(/#(\d+)/);
    return m1 ? Number(m1[1]) : Infinity;
  };
  switch (mrState.sort) {
    case 'price':
      list.sort((a, b) => (mrNum(a.blended_3to1_usd) ?? Infinity) - (mrNum(b.blended_3to1_usd) ?? Infinity));
      break;
    case 'new':
      list.sort((a, b) => new Date(b.released_date || 0) - new Date(a.released_date || 0));
      break;
    case 'context':
      list.sort((a, b) => (mrNum(b.context_k) ?? 0) - (mrNum(a.context_k) ?? 0));
      break;
    default:
      list.sort((a, b) => rankVal(a) - rankVal(b));
  }
  return list;
}

function mrRenderModels() {
  const el = $('mrModelGrid');
  if (!el) return;
  const list = mrFilteredModels();
  const countEl = $('mrModelCount');
  const total = (mrState.payload.models || []).length;
  if (countEl) countEl.textContent = `SHOWING ${list.length} / ${total} MODELS`;

  if (list.length === 0) {
    el.innerHTML = `<div class="col-span-full text-center py-14 text-gray-400 text-sm">ไม่พบโมเดลที่ตรงกับเงื่อนไข — ลองเปลี่ยนตัวกรองหรือล้างคำค้นหา</div>`;
    return;
  }

  el.innerHTML = list.map((m, idx) => {
    const isNew = mrIsNew(m);
    const free = mrIsFree(m);
    const tools = /^yes$/i.test(String(m.tool_calling || ''));
    const hermesReady = /^yes$/i.test(String(m.hermes_ready || ''));
    const tags = String(m.best_for || '').split(/[•,|]/).map((t) => t.trim()).filter(Boolean)
      .filter((t) => !/^general$/i.test(t));
    const rank = String(m.rank_openrouter || '').trim();
    const showRank = rank && rank !== '-';
    const delay = Math.min(idx * 40, 420);

    return `
      <article class="mr-card rounded-2xl bg-radarCard/85 backdrop-blur-md border border-radarBorder hover:border-emerald-400/45 p-4 shadow-xl space-y-3 transition-all"
        style="animation-delay:${delay}ms">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border ${mrTierClass(m.tier)}">${mrEsc(mrTierLabel(m.tier))}</span>
              ${showRank ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/35">${mrEsc(rank.startsWith('#') || rank.startsWith('Top') ? rank : '#' + rank)}</span>` : ''}
              ${isNew ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-200 border border-rose-400/45">NEW</span>` : ''}
            </div>
            <h3 class="mt-1.5 text-sm md:text-base font-bold text-white leading-snug break-words">${mrEsc(m.model_name || m.model_id)}</h3>
            <div class="font-mono text-[10px] text-gray-500 truncate" title="${mrEsc(m.model_id)}">${mrEsc(m.provider || '')} · ${mrEsc(m.model_id)}</div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="rounded-lg bg-black/30 border border-white/5 p-2">
            <div class="font-mono text-[9px] uppercase tracking-wider text-gray-500">In/1M</div>
            <div class="text-xs font-bold text-gray-100">${mrPrice(m.input_per_1m_usd)}</div>
          </div>
          <div class="rounded-lg bg-black/30 border border-white/5 p-2">
            <div class="font-mono text-[9px] uppercase tracking-wider text-gray-500">Out/1M</div>
            <div class="text-xs font-bold text-gray-100">${mrPrice(m.output_per_1m_usd)}</div>
          </div>
          <div class="rounded-lg bg-black/30 border border-white/5 p-2">
            <div class="font-mono text-[9px] uppercase tracking-wider text-gray-500">Blend 3:1</div>
            <div class="text-xs font-bold ${free ? 'text-emerald-300' : 'text-cyan-300'}">${mrPrice(m.blended_3to1_usd)}</div>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap text-[10px] font-mono text-gray-400">
          <span class="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">🧠 ${mrCtx(m.context_k)} ctx</span>
          <span class="px-2 py-0.5 rounded-full ${tools ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/30' : 'bg-white/5 border border-white/10'}">${tools ? '🔧 Tools' : 'ไม่มี Tools'}</span>
          <span class="px-2 py-0.5 rounded-full ${hermesReady ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-400/30' : 'bg-white/5 border border-white/10'}">${hermesReady ? '✓ Hermes' : 'Hermes: Test'}</span>
          ${m.released_date ? `<span class="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">📅 ${mrEsc(m.released_date)}</span>` : ''}
        </div>

        ${tags.length ? `<div class="flex flex-wrap gap-1.5">${tags.map((t) => `<span class="px-2 py-0.5 rounded-md text-[10px] bg-violet-500/10 text-violet-200 border border-violet-400/25">${mrEsc(t)}</span>`).join('')}</div>` : ''}

        <div class="pt-1 flex items-center justify-between gap-2">
          <button type="button" data-mr-copy="${mrEsc(m.model_id)}"
            class="mr-copy-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 hover:bg-emerald-500/25 hover:shadow-[0_0_14px_rgba(16,185,129,0.28)] text-xs font-semibold transition-all active:scale-95">
            📋 Copy Model ID
          </button>
          ${m.source_url ? `<a href="${mrEsc(m.source_url)}" target="_blank" rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
            OpenRouter
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </a>` : ''}
        </div>
      </article>`;
  }).join('');

  el.querySelectorAll('.mr-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => mrCopy(btn.dataset.mrCopy, 'คัดลอก Model ID: ' + btn.dataset.mrCopy));
  });
}

function mrRankRow(r) {
  const rankBadge = r.rank <= 3
    ? 'bg-amber-500/20 text-amber-200 border-amber-400/45'
    : 'bg-white/5 text-gray-300 border-white/10';
  return `
    <div class="flex items-center gap-3 p-2.5 rounded-xl bg-black/25 border border-white/5 hover:border-emerald-400/35 transition-colors">
      <span class="font-mono text-xs font-bold w-7 text-center px-1.5 py-0.5 rounded-md border ${rankBadge}">${mrEsc(r.rank)}</span>
      <div class="min-w-0 flex-1">
        <div class="text-xs font-semibold text-white truncate">${mrEsc(r.display_name || r.model_permaslug)}</div>
        <div class="font-mono text-[10px] text-gray-500 truncate">${mrEsc(r.provider || '')} · ${mrEsc(r.model_permaslug)}</div>
      </div>
      <button type="button" data-mr-copy="${mrEsc(r.model_permaslug)}"
        class="mr-copy-btn shrink-0 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-emerald-200 text-[10px] font-semibold hover:bg-emerald-500/20 transition-colors active:scale-95">📋 ID</button>
    </div>`;
}

function mrRenderRankings(p) {
  const el = $('mrRankings');
  if (!el) return;
  const rows = Array.isArray(p.rankings) ? p.rankings : [];
  const overall = rows.filter((r) => !/free/i.test(String(r.list_type || ''))).sort((a, b) => a.rank - b.rank);
  const free = rows.filter((r) => /free/i.test(String(r.list_type || ''))).sort((a, b) => a.rank - b.rank);

  if (rows.length === 0) {
    el.innerHTML = `<div class="text-center py-10 text-gray-400 text-sm">ยังไม่มีข้อมูล Rankings (รอ sync จาก OpenRouter)</div>`;
    return;
  }

  const block = (title, icon, list) => list.length ? `
    <div class="space-y-2">
      <h4 class="font-mono text-[11px] font-bold uppercase tracking-widest text-cyan-300 flex items-center gap-1.5">${icon} ${mrEsc(title)}</h4>
      ${list.map(mrRankRow).join('')}
    </div>` : '';

  el.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
    ${block('Overall Token Volume', '📊', overall.slice(0, 20))}
    ${block('Free Models (Daily)', '🆓', free.slice(0, 10))}
  </div>`;

  el.querySelectorAll('.mr-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => mrCopy(btn.dataset.mrCopy, 'คัดลอก Model ID: ' + btn.dataset.mrCopy));
  });
}

function mrRenderPresets(p) {
  const el = $('mrPresets');
  if (!el) return;
  const presets = Array.isArray(p.hermes_presets) ? p.hermes_presets : [];
  if (presets.length === 0) {
    el.innerHTML = `<div class="text-center py-10 text-gray-400 text-sm">ยังไม่มี Hermes Presets ในชีต Hermes_Presets</div>`;
    return;
  }
  el.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${presets.map((pr) => {
    const fallbackJson = JSON.stringify({ models: [pr.primary_model_id, pr.fallback_model_id].filter(Boolean) }, null, 2);
    return `
      <div class="rounded-2xl bg-radarCard/85 border border-radarBorder hover:border-cyan-400/40 p-4 space-y-3 transition-colors">
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-sm font-bold text-white">${mrEsc(pr.profile_name || 'preset')}</h4>
          ${pr.cost_tier ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono border ${mrTierClass(pr.cost_tier)}">${mrEsc(pr.cost_tier)}</span>` : ''}
        </div>
        ${pr.use_case ? `<p class="text-xs text-gray-300/90 leading-relaxed">${mrEsc(pr.use_case)}</p>` : ''}
        <div class="space-y-1.5 text-[11px] font-mono">
          <div class="flex items-center gap-2"><span class="text-emerald-400 shrink-0">PRIMARY</span><span class="text-gray-200 truncate">${mrEsc(pr.primary_model_id)}</span></div>
          <div class="flex items-center gap-2"><span class="text-amber-400 shrink-0">FALLBACK</span><span class="text-gray-200 truncate">${mrEsc(pr.fallback_model_id)}</span></div>
          ${pr.routing_mode ? `<div class="flex items-center gap-2"><span class="text-cyan-400 shrink-0">ROUTE</span><span class="text-gray-300">${mrEsc(pr.routing_mode)}</span></div>` : ''}
        </div>
        ${pr.notes ? `<p class="text-[11px] text-gray-400 italic">${mrEsc(pr.notes)}</p>` : ''}
        <button type="button" data-mr-json='${mrEsc(fallbackJson)}'
          class="mr-copy-json w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-400/35 text-cyan-200 hover:bg-cyan-500/25 text-xs font-semibold transition-all active:scale-95">
          📋 Copy Fallback JSON
        </button>
      </div>`;
  }).join('')}</div>`;

  el.querySelectorAll('.mr-copy-json').forEach((btn) => {
    btn.addEventListener('click', () => mrCopy(btn.dataset.mrJson, 'คัดลอก Fallback JSON แล้ว'));
  });
}

function mrRenderFooter(p) {
  const el = $('mrAttribution');
  if (!el) return;
  const attr = p.attribution || 'Source: OpenRouter (openrouter.ai/rankings), Licensed under CC BY 4.0.';
  el.innerHTML = `${mrEsc(attr)} <a href="https://openrouter.ai/rankings" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">openrouter.ai/rankings</a>`;
}

// ============================================================================
// 8. Sub-tab switching (Rankings | Presets)
// ============================================================================
function mrSetSubTab(tab) {
  mrState.subTab = tab;
  const panels = { rankings: $('mrPanelRankings'), presets: $('mrPanelPresets') };
  const btns = { rankings: $('mrSubRankings'), presets: $('mrSubPresets') };
  Object.keys(panels).forEach((k) => {
    if (panels[k]) panels[k].classList.toggle('hidden', k !== tab);
    if (btns[k]) {
      const on = k === tab;
      btns[k].className = 'flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ' +
        (on ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-gray-950 shadow-[0_0_14px_rgba(16,185,129,0.3)]'
            : 'text-gray-400 hover:text-white');
    }
  });
}

// ============================================================================
// 9. Wire up once
// ============================================================================
let mrWired = false;
let mrViewInited = false;

function mrInitView() {
  if (!mrViewInited) {
    mrViewInited = true;
    mrLoadData(false);
  }
}

function mrWire() {
  if (mrWired) return;
  mrWired = true;

  const tabNews = $('mrTabNews');
  const tabModels = $('mrTabModels');
  if (tabNews) tabNews.addEventListener('click', () => mrSetView('news'));
  if (tabModels) tabModels.addEventListener('click', () => mrSetView('models'));

  // tier pills
  document.querySelectorAll('[data-mr-tier]').forEach((btn) => {
    btn.addEventListener('click', () => { mrState.tier = btn.dataset.mrTier; mrRenderFiltersState(); mrRenderModels(); });
  });

  // hermes toggle
  const toggle = $('mrHermesToggle');
  if (toggle) toggle.addEventListener('click', () => { mrState.hermesOnly = !mrState.hermesOnly; mrRenderFiltersState(); mrRenderModels(); });

  // search
  const search = $('mrSearch');
  if (search) {
    search.addEventListener('input', (e) => { mrState.query = e.target.value.trim(); mrRenderModels(); });
  }

  // sort
  const sort = $('mrSort');
  if (sort) sort.addEventListener('change', (e) => { mrState.sort = e.target.value; mrRenderModels(); });

  // manual refresh
  const refresh = $('mrRefreshBtn');
  if (refresh) refresh.addEventListener('click', () => mrLoadData(true));

  // sub-tabs
  const subR = $('mrSubRankings');
  const subP = $('mrSubPresets');
  if (subR) subR.addEventListener('click', () => mrSetSubTab('rankings'));
  if (subP) subP.addEventListener('click', () => mrSetSubTab('presets'));

  // hash routing
  window.addEventListener('hashchange', () => mrSetView(mrViewFromHash(), false));
}

// ============================================================================
// 10. Boot
// ============================================================================
function mrBoot() {
  mrWire();
  mrSetView(mrViewFromHash(), false);
  if (mrViewFromHash() === 'models') mrInitView();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mrBoot);
} else {
  mrBoot();
}
