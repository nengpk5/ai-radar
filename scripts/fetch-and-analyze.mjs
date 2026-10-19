// scripts/fetch-and-analyze.mjs
// Automated AI & Tech News Radar (Zero-Dependency Node 20+)

import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Load .env locally if present
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
const PATH_HASHES = path.resolve(process.cwd(), 'public/data/seen_hashes.json');

// Helper for fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// 3.1 Data Sources
async function fetchOpenRouterModels() {
  try {
    const res = await fetchWithTimeout('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) return [];

    // Sort by created descending if available or slice top 10
    const sorted = [...data.data].sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 10);
    return sorted.map(m => ({
      id: `or_${m.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      title: `[OpenRouter Model] ${m.name || m.id}`,
      description: m.description || `New AI model ${m.name || m.id} added on OpenRouter. Context: ${m.context_length || 'N/A'}.`,
      url: `https://openrouter.ai/${m.id}`,
      published_at: m.created ? new Date(m.created * 1000).toISOString() : new Date().toISOString()
    }));
  } catch (err) {
    console.error('Fetch OpenRouter failed:', err.message);
    return [];
  }
}

async function fetchHuggingFaceTrending() {
  try {
    const res = await fetchWithTimeout('https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=10');
    if (!res.ok) throw new Error(`HuggingFace HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map(m => ({
      id: `hf_${(m.id || m._id).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      title: `[HuggingFace Trending] ${m.id}`,
      description: `Trending model on HuggingFace. Pipeline: ${m.pipeline_tag || 'general'}, Likes: ${m.likes || 0}, Trending Score: ${m.trendingScore || 0}`,
      url: `https://huggingface.co/${m.id}`,
      published_at: m.createdAt || new Date().toISOString()
    }));
  } catch (err) {
    console.error('Fetch HuggingFace failed:', err.message);
    return [];
  }
}

async function fetchHackerNewsAI() {
  try {
    const res = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!res.ok) throw new Error(`HN Top stories HTTP ${res.status}`);
    const storyIds = (await res.json()).slice(0, 40);

    const regex = /\b(AI|LLM|GPT|Claude|Anthropic|OpenAI|DeepSeek|Gemini|Hermes|Nous|Agent|MCP|OpenRouter|Qwen|Llama)\b/i;
    const fetchItemPromises = storyIds.map(async id => {
      try {
        const itemRes = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 5000);
        if (!itemRes.ok) return null;
        return await itemRes.json();
      } catch {
        return null;
      }
    });

    const items = await Promise.all(fetchItemPromises);
    const aiItems = items.filter(it => it && it.title && regex.test(it.title));

    return aiItems.slice(0, 10).map(it => ({
      id: `hn_${it.id}`,
      title: `[HackerNews] ${it.title}`,
      description: `Hacker News discussion (Score: ${it.score || 0}, Comments: ${it.descendants || 0})`,
      url: it.url || `https://news.ycombinator.com/item?id=${it.id}`,
      published_at: it.time ? new Date(it.time * 1000).toISOString() : new Date().toISOString()
    }));
  } catch (err) {
    console.error('Fetch Hacker News failed:', err.message);
    return [];
  }
}

async function fetchBluesky() {
  try {
    const res = await fetchWithTimeout('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=simonwillison.net&limit=5');
    if (!res.ok) throw new Error(`Bluesky HTTP ${res.status}`);
    const data = await res.json();
    if (!data.feed || !Array.isArray(data.feed)) return [];

    return data.feed.map(item => {
      const post = item.post;
      const rKey = post.uri ? post.uri.split('/').pop() : post.cid;
      const text = post.record?.text || '';
      return {
        id: `bsky_${post.cid || rKey}`,
        title: `[Bluesky @simonwillison] ${text.slice(0, 80).replace(/\n/g, ' ')}...`,
        description: text,
        url: `https://bsky.app/profile/${post.author?.handle || 'simonwillison.net'}/post/${rKey}`,
        published_at: post.record?.createdAt || new Date().toISOString()
      };
    });
  } catch (err) {
    console.error('Fetch Bluesky failed:', err.message);
    return [];
  }
}

async function fetchGoogleNewsRSS() {
  try {
    const url = 'https://news.google.com/rss/search?q=site:x.com+(OpenAI+OR+Anthropic+OR+Claude+OR+DeepSeek+OR+Gemini)&hl=en-US&gl=US&ceid=US:en';
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Google News RSS HTTP ${res.status}`);
    const xml = await res.text();

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const block = match[1];
      const titleMatch = /<title>(.*?)<\/title>/.exec(block);
      const linkMatch = /<link>(.*?)<\/link>/.exec(block);
      const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(block);

      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
      const link = linkMatch ? linkMatch[1].trim() : '';
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';

      if (title && link) {
        const hash = crypto.createHash('sha256').update(link || title).digest('hex').slice(0, 16);
        items.push({
          id: `gn_${hash}`,
          title: `[X/Google News] ${title}`,
          description: title,
          url: link,
          published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
        });
      }
    }
    return items;
  } catch (err) {
    console.error('Fetch Google News RSS failed:', err.message);
    return [];
  }
}

// 3.3 AI Analysis with Fallback
async function analyzeWithAI(candidates, env) {
  const prompt = `You are an elite AI & Tech Radar intelligence analyst.
Analyze the following list of newly discovered raw tech/AI items.
Filter out low-value noise and duplicate information.
Evaluate the impact specifically for an AI Engineer.

Requirements:
1. Output ONLY a valid JSON object matching the exact schema below.
2. Translate and write "title_th" and "summary_th" in fluent, natural Thai.
3. "summary_th" must be 2-3 concise lines answering: คืออะไร (What it is) | ดีกว่าเดิมยังไง (Why it is better) | เอาไปใช้อะไรต่อได้ (How to use it).
4. vendor must be one of: "Anthropic" | "OpenAI" | "DeepSeek" | "Google" | "OpenSource" | "Tooling"
5. category must be one of: "Model Release" | "Dev Tool" | "Benchmark" | "Research"
6. score must be an integer from 1 to 10:
   - Rule: ONLY include items with score >= 5.
   - Rule: Give score >= 8 ONLY for major model releases, big API/Agent/MCP updates, or groundbreaking benchmarks.

JSON Output Schema:
{
  "events": [
    {
      "id": "original item id",
      "timestamp": "ISO-8601 string",
      "score": 8,
      "vendor": "OpenAI",
      "category": "Model Release",
      "title_th": "หัวข้อข่าวภาษาไทยสั้น กระชับ",
      "summary_th": "สรุป 2-3 บรรทัด คืออะไร | ดีกว่าเดิมยังไง | เอาไปใช้อะไรต่อได้",
      "url": "https://..."
    }
  ]
}

Items to analyze:
${JSON.stringify(candidates, null, 2)}
`;

  // Primary: Gemini
  if (env.GEMINI_API_KEY) {
    const geminiModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-flash-latest'
    ];
    for (const modelName of geminiModels) {
      try {
        console.log(`Attempting AI analysis via Primary (Google ${modelName})...`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
        const res = await fetchWithTimeout(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2
            }
          })
        }, 30000);

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`Gemini model ${modelName} returned HTTP ${res.status}: ${errText}`);
          continue;
        }

        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) continue;
        const parsed = JSON.parse(rawText);
        console.log(`Gemini (${modelName}) analysis succeeded with ${parsed.events?.length || 0} events.`);
        return parsed.events || [];
      } catch (err) {
        console.warn(`Gemini (${modelName}) error: ${err.message}`);
      }
    }
  }

  // Fallback: OpenRouter
  if (env.OPENROUTER_API_KEY) {
    try {
      console.log('Attempting AI analysis via Fallback (OpenRouter API)...');
      const orModels = [
        'nvidia/nemotron-3.5-lightning:free',
        'nvidia/nemotron-3.5-super-vl:free',
        'minimax/minimax-m3.1-flash:free',
        'liquid/lfm-2.5-2.6b:free'
      ];

      for (const model of orModels) {
        try {
          console.log(`Trying OpenRouter model: ${model}...`);
          const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
              'HTTP-Referer': 'https://github.com',
              'X-Title': 'AI Radar'
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: 'You are a JSON-only API. You must respond strictly with valid JSON conforming to the requested schema. Do not write markdown wrappers.' },
                { role: 'user', content: prompt }
              ],
              response_format: { type: 'json_object' }
            })
          }, 35000);

          if (!res.ok) {
            const errBody = await res.text();
            console.warn(`OpenRouter model ${model} HTTP ${res.status}: ${errBody}`);
            continue;
          }

          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const cleanContent = content.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            const parsed = JSON.parse(cleanContent);
            console.log(`OpenRouter fallback succeeded with ${parsed.events?.length || 0} events.`);
            return parsed.events || [];
          }
        } catch (subErr) {
          console.warn(`OpenRouter model ${model} error: ${subErr.message}`);
        }
      }
    } catch (err) {
      console.error('OpenRouter fallback completely failed:', err.message);
    }
  }

  throw new Error('All AI providers (Gemini & OpenRouter) failed or are unconfigured.');
}

// 3.4 Telegram Alert
async function sendTelegramAlert(event, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const text = `🚨 *AI RADAR BREAKING [Score ${event.score}/10]*\n\n` +
      `*${event.title_th}*\n` +
      `🏢 *Vendor:* ${event.vendor} | 🏷️ *Category:* ${event.category}\n\n` +
      `${event.summary_th}\n\n` +
      `🔗 [อ่านข่าวต้นทาง](${event.url})`;

    await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      })
    }, 10000);
    console.log(`Telegram alert sent for: ${event.title_th}`);
  } catch (err) {
    console.error('Failed to send Telegram alert:', err.message);
  }
}

// Google Sheets Webhook
async function sendGoogleSheetsWebhook(events, env) {
  if (!env.GOOGLE_SHEETS_WEBHOOK_URL || !events.length) return;
  try {
    await fetchWithTimeout(env.GOOGLE_SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, timestamp: new Date().toISOString() })
    }, 10000);
    console.log(`Google Sheets webhook delivered ${events.length} events.`);
  } catch (err) {
    console.error('Failed to send Google Sheets webhook:', err.message);
  }
}

// Main execution flow
async function main() {
  console.log('=== AI Radar Ingestion & Analysis Started ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Load seen hashes
  let seenHashes = [];
  try {
    const rawHashes = await fs.readFile(PATH_HASHES, 'utf8');
    seenHashes = JSON.parse(rawHashes);
  } catch {
    seenHashes = [];
  }
  const seenSet = new Set(seenHashes);

  // Load existing news
  let existingNews = [];
  try {
    const rawNews = await fs.readFile(PATH_NEWS, 'utf8');
    existingNews = JSON.parse(rawNews);
  } catch {
    existingNews = [];
  }

  // 3.1 Fetch concurrently
  console.log('Fetching from 5 sources concurrently...');
  const results = await Promise.allSettled([
    fetchOpenRouterModels(),
    fetchHuggingFaceTrending(),
    fetchHackerNewsAI(),
    fetchBluesky(),
    fetchGoogleNewsRSS()
  ]);

  const allFetched = [];
  results.forEach((res, idx) => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      allFetched.push(...res.value);
    } else {
      console.warn(`Source index ${idx} failed or returned non-array:`, res.reason);
    }
  });

  console.log(`Total raw items fetched: ${allFetched.length}`);

  // 3.2 Deduplication Logic
  const newCandidates = allFetched.filter(item => !seenSet.has(item.id));
  console.log(`New unseen candidate items: ${newCandidates.length}`);

  if (newCandidates.length === 0) {
    console.log('No new AI items found.');
    process.exit(0);
  }

  // Limit chunk size per analysis to keep LLM context sharp and cost zero/minimal
  const candidatesToAnalyze = newCandidates.slice(0, 25);

  // 3.3 AI Analysis
  const scoredEvents = await analyzeWithAI(candidatesToAnalyze, process.env);
  console.log(`Analyzed events meeting criteria (score >= 5): ${scoredEvents.length}`);

  // Prepend new events and deduplicate by id/url against existing news
  const existingUrls = new Set(existingNews.map(n => n.url));
  const existingIds = new Set(existingNews.map(n => n.id));

  const validNewEvents = scoredEvents.filter(ev => !existingUrls.has(ev.url) && !existingIds.has(ev.id));

  // Merge & limit news to latest 200 items
  const updatedNews = [...validNewEvents, ...existingNews].slice(0, 200);

  // Update seen_hashes (keep latest 500)
  const candidateIds = candidatesToAnalyze.map(c => c.id);
  const updatedHashes = [...candidateIds, ...seenHashes].slice(0, 500);

  // Save files
  await fs.mkdir(path.dirname(PATH_NEWS), { recursive: true });
  await fs.writeFile(PATH_NEWS, JSON.stringify(updatedNews, null, 2), 'utf8');
  await fs.writeFile(PATH_HASHES, JSON.stringify(updatedHashes, null, 2), 'utf8');
  console.log(`Saved ${updatedNews.length} news items to public/data/news.json`);
  console.log(`Updated seen hashes (${updatedHashes.length} items) in public/data/seen_hashes.json`);

  // Notifications
  for (const ev of validNewEvents) {
    if (ev.score >= 8) {
      await sendTelegramAlert(ev, process.env);
    }
  }

  if (validNewEvents.length > 0) {
    await sendGoogleSheetsWebhook(validNewEvents, process.env);
  }

  console.log('=== AI Radar Run Completed Successfully ===');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
