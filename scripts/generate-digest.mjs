// scripts/generate-digest.mjs
// Zero-Dependency Node 20+ OpenRouter-Powered Daily Briefing & Weekly Radar Report Generator
// Usage:
//   node scripts/generate-digest.mjs daily
//   node scripts/generate-digest.mjs weekly
//   node scripts/generate-digest.mjs both
//   node scripts/generate-digest.mjs backfill-deepdive

import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val.replace(/^["']|["']$/g, '');
          }
        }
      }
    } catch (e) {
      console.warn('Notice: Could not parse .env file:', e.message);
    }
  }
}
loadEnv();

const PATH_NEWS = path.resolve(process.cwd(), 'public/data/news.json');
const PATH_DAILY = path.resolve(process.cwd(), 'public/data/daily_brief.json');
const PATH_WEEKLY = path.resolve(process.cwd(), 'public/data/weekly_report.json');

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 55000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timeout of ${timeoutMs}ms exceeded`)), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Primary: OpenRouter Free Models (100% Zero-Cost), Fallback: Gemini Lite
async function callOpenRouterPrimary(prompt, env) {
  if (env.OPENROUTER_API_KEY) {
    const orModels = [
      'baidu/ernie-5.5-flash-preview:free',
      'nvidia/nemotron-3.5-super-vl:free',
      'openrouter/free'
    ];
    for (const model of orModels) {
      try {
        console.log(`Calling OpenRouter (${model})...`);
        const data = await fetchJsonWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://github.com',
            'X-Title': 'AI Radar Digest'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You are a JSON-only API. Respond strictly with valid JSON conforming to the requested schema. No markdown fences.' },
              { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
          })
        }, 55000);

        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const clean = content.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
          const parsed = JSON.parse(clean);
          const actualModel = data.model || model;
          console.log(`OpenRouter succeeded (${actualModel}).`);
          return { parsed, modelUsed: actualModel };
        }
      } catch (err) {
        console.warn(`OpenRouter (${model}) failed: ${err.message}`);
      }
    }
  }

  // Fallback to Gemini Lite
  if (env.GEMINI_API_KEY) {
    for (const modelName of ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest']) {
      try {
        console.log(`Falling back to Google ${modelName}...`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
        const data = await fetchJsonWithTimeout(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
          })
        }, 45000);
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          return { parsed: JSON.parse(rawText), modelUsed: modelName };
        }
      } catch (err) {
        console.warn(`Gemini (${modelName}) fallback failed: ${err.message}`);
      }
    }
  }

  throw new Error('All AI providers failed for digest generation.');
}

async function sendTelegramMessage(text, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetchJsonWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    }, 10000);
    console.log('Telegram digest sent.');
  } catch (err) {
    console.warn('Telegram digest failed:', err.message);
  }
}

async function loadNews() {
  try {
    const raw = await fs.readFile(PATH_NEWS, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function generateDailyBrief(news) {
  console.log('=== Generating Daily Morning Briefing ===');
  const now = Date.now();
  const cutoff = now - 36 * 60 * 60 * 1000; // last 36 hours
  let recent = news.filter(n => n.timestamp && new Date(n.timestamp).getTime() >= cutoff);
  if (recent.length < 5) {
    recent = news.slice(0, 15);
  } else {
    recent = recent.slice(0, 20);
  }

  const compactItems = recent.map(n => ({
    score: n.score,
    vendor: n.vendor,
    category: n.category,
    title_th: n.title_th,
    summary_th: n.summary_th,
    url: n.url
  }));

  const prompt = `You are a Chief AI Analyst writing a crisp Daily Morning Briefing in Thai for AI Engineers.
From the news items below, select the 3 most important stories and summarize today's overarching AI trend.
Output ONLY a valid JSON object matching this exact schema:
{
  "headline_th": "พาดหัวสรุปภาพรวมข่าว AI วันนี้ 1 บรรทัดแบบดึงดูดและตรงประเด็น",
  "trend_th": "สรุปเทรนด์สำคัญประจำวัน 1-2 ประโยคที่วิศวกร AI ควรรู้",
  "top_stories": [
    {
      "title_th": "หัวข้อข่าวสั้นกระชับ",
      "why_it_matters": "ทำไมวิศวกร AI ต้องสนใจ และเอาไปต่อยอดยังไงได้บ้าง (1-2 ประโยค)",
      "vendor": "OpenAI | Anthropic | Google | DeepSeek | OpenSource | Tooling",
      "url": "exact URL from input"
    }
  ]
}
Rule: "top_stories" must contain exactly 3 items (or fewer only if fewer than 3 inputs exist). Use real URLs from the input.

News items:
${JSON.stringify(compactItems, null, 2)}
`;

  const { parsed, modelUsed } = await callOpenRouterPrimary(prompt, process.env);
  const dateTh = new Date().toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const output = {
    generated_at: new Date().toISOString(),
    date_th: dateTh,
    headline_th: parsed.headline_th || 'สรุปข่าว AI ประจำวัน',
    trend_th: parsed.trend_th || '',
    top_stories: Array.isArray(parsed.top_stories) ? parsed.top_stories.slice(0, 3) : [],
    model_used: modelUsed
  };

  await fs.writeFile(PATH_DAILY, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Saved Daily Briefing to public/data/daily_brief.json (model: ${modelUsed})`);

  if (output.top_stories.length > 0) {
    const msg = `☀️ *AI RADAR MORNING BRIEFING (${dateTh})*\n\n` +
      `*${output.headline_th}*\n_${output.trend_th}_\n\n` +
      output.top_stories.map((s, i) => `${i + 1}. *${s.title_th}* (${s.vendor})\n${s.why_it_matters}\n🔗 ${s.url}`).join('\n\n');
    await sendTelegramMessage(msg, process.env);
  }
}

async function generateWeeklyReport(news) {
  console.log('=== Generating Weekly Radar Report ===');
  const now = Date.now();
  const cutoff = now - 7 * 24 * 60 * 60 * 1000; // last 7 days
  let weeklyItems = news.filter(n => n.timestamp && new Date(n.timestamp).getTime() >= cutoff);
  if (weeklyItems.length < 10) {
    weeklyItems = news.slice(0, 40);
  } else {
    weeklyItems = weeklyItems.slice(0, 50);
  }

  const compactItems = weeklyItems.map(n => ({
    score: n.score,
    vendor: n.vendor,
    category: n.category,
    title_th: n.title_th,
    summary_th: n.summary_th,
    url: n.url
  }));

  const prompt = `You are a Principal AI Analyst writing a Weekly AI & Tech Radar Report in Thai for AI Engineers.
Analyze the past week's curated AI news and synthesize a clear, high-signal weekly report.
Output ONLY a valid JSON object matching this exact schema:
{
  "executive_summary_th": "สรุปภาพรวมวงการ AI ตลอดสัปดาห์ที่ผ่านมา 2-3 ประโยคแบบเจาะเนื้อหา",
  "top_models": [
    {
      "name": "ชื่อโมเดลเด่นประจำสัปดาห์",
      "vendor": "ชื่อค่าย",
      "takeaway_th": "จุดเด่นหรือเหตุผลที่ต้องจับตา (1-2 ประโยค)",
      "url": "exact URL from input"
    }
  ],
  "top_tools": [
    {
      "name": "ชื่อ Dev Tool / Agent / MCP / Framework เด่น",
      "takeaway_th": "เอาไปช่วยงานพัฒนาอะไรได้บ้าง (1-2 ประโยค)",
      "url": "exact URL from input"
    }
  ],
  "vendor_highlights": [
    {
      "vendor": "OpenAI | Anthropic | Google | DeepSeek | OpenSource | Tooling",
      "summary_th": "สรุปความเคลื่อนไหวสำคัญของค่ายนี้ในสัปดาห์นี้ (1-2 ประโยค)"
    }
  ]
}
Rules:
- "top_models": 3 to 5 items.
- "top_tools": 2 to 4 items.
- "vendor_highlights": include only vendors that actually appeared in the news (3 to 6 items).
- Use real URLs from the input.

News items from the past week:
${JSON.stringify(compactItems, null, 2)}
`;

  const { parsed, modelUsed } = await callOpenRouterPrimary(prompt, process.env);
  const endDate = new Date();
  const startDate = new Date(now - 6 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' });
  const yearTh = endDate.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric' });

  const output = {
    generated_at: endDate.toISOString(),
    period_th: `${fmt(startDate)} – ${fmt(endDate)} ${yearTh}`,
    items_analyzed: weeklyItems.length,
    executive_summary_th: parsed.executive_summary_th || '',
    top_models: Array.isArray(parsed.top_models) ? parsed.top_models.slice(0, 5) : [],
    top_tools: Array.isArray(parsed.top_tools) ? parsed.top_tools.slice(0, 4) : [],
    vendor_highlights: Array.isArray(parsed.vendor_highlights) ? parsed.vendor_highlights.slice(0, 6) : [],
    model_used: modelUsed
  };

  await fs.writeFile(PATH_WEEKLY, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Saved Weekly Report to public/data/weekly_report.json (model: ${modelUsed})`);

  const msg = `📊 *AI RADAR WEEKLY REPORT (${output.period_th})*\n\n${output.executive_summary_th}`;
  await sendTelegramMessage(msg, process.env);
}

async function backfillDeepDive(news) {
  console.log('=== Backfilling Deep-Dive for top Breaking 8+ items ===');
  let updated = 0;
  for (const item of news) {
    if ((item.score || 0) >= 8 && !item.deep_dive_th && updated < 3) {
      const prompt = `You are a Principal AI Engineer writing a concise technical deep-dive in Thai for a breaking AI news item.
Output ONLY a valid JSON object with these 3 exact string fields:
{
  "highlights": "เจาะลึกจุดเด่นทางเทคนิค สเปก หรือสถาปัตยกรรมที่เปลี่ยนไปจากรุ่นก่อนหน้า (2-3 ประโยคกระชับ)",
  "pros_cons": "ข้อดีหลัก และข้อจำกัดหรือสิ่งที่ควรระวังก่อนนำไปใช้จริงบน Production (2-3 ประโยค)",
  "actionable": "แนวทางทดลองใช้งานจริง / Use case หรือไอเดียต่อยอดสำหรับนักพัฒนาและ AI Engineer (2-3 ประโยค)"
}

News Item:
Title: ${item.title_th}
Vendor: ${item.vendor} | Category: ${item.category} | Score: ${item.score}/10
Summary: ${item.summary_th}
URL: ${item.url}
`;
      try {
        const { parsed } = await callOpenRouterPrimary(prompt, process.env);
        if (parsed.highlights && parsed.pros_cons && parsed.actionable) {
          item.deep_dive_th = {
            highlights: parsed.highlights,
            pros_cons: parsed.pros_cons,
            actionable: parsed.actionable
          };
          updated++;
          console.log(`Enriched deep-dive (${updated}/3): ${item.title_th}`);
        }
      } catch (err) {
        console.warn(`Backfill failed for ${item.id}: ${err.message}`);
      }
    }
  }
  if (updated > 0) {
    await fs.writeFile(PATH_NEWS, JSON.stringify(news, null, 2), 'utf8');
    console.log(`Updated ${updated} breaking news items with Deep-Dive in public/data/news.json`);
  } else {
    console.log('No breaking 8+ items needed backfill.');
  }
}

async function main() {
  const mode = (process.argv[2] || 'daily').toLowerCase();
  const news = await loadNews();
  if (!news.length) {
    console.log('No news available in public/data/news.json. Exiting.');
    process.exit(0);
  }

  if (mode === 'daily') {
    await generateDailyBrief(news);
  } else if (mode === 'weekly') {
    await generateWeeklyReport(news);
  } else if (mode === 'both') {
    await generateDailyBrief(news);
    await generateWeeklyReport(news);
  } else if (mode === 'backfill-deepdive') {
    await backfillDeepDive(news);
  } else {
    console.error(`Unknown mode: ${mode}. Use daily | weekly | both | backfill-deepdive`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal digest error:', err);
  process.exit(1);
});
