TASK.md — Automated AI & Tech News Radar (Zero-Cost  Zero-X Account Architecture)
CRITICAL INSTRUCTIONS FOR AI AGENT (ANTIGRAVITY - 3.8 FLASH)
You are an autonomous software engineering agent building a complete, production-ready, zero-cost AI & Tech News Radar application.

STRICT EXECUTION RULES

DO NOT SKIP STEPS. Follow the phases sequentially from Phase 1 to Phase 6.

MINIMAL USER EFFORT The user wants to do ZERO manual coding or complex dashboard configuration. If you need API keys, tokens, or repository URLs, ASK THE USER DIRECTLY IN THE CHAT, take their reply, and automatically write the configuration files  GitHub Secrets (via gh CLI if available) or .env files yourself.

NO EXTERNAL NPM BLOAT FOR FRONTEND Build the Frontend PWA using Vanilla HTML5, CSS (Tailwind CDN), and Vanilla JavaScript with IndexedDB for offline-first caching. No ReactVite build step required so Netlify deploys in 1 second with zero build errors.

BACKEND CRON VIA GITHUB ACTIONS (ZERO-AUTH DB) Use Node.js (native fetch, Node 20+, zero external dependencies) triggered by GitHub Actions every 15 minutes. Store deduplication state and curated news directly in publicdatanews.json and publicdataseen_hashes.json.

GIT STANDARDS Work cleanly. Use Conventional Commits (feat, chore, fix).

PHASE 1 Interactive User Onboarding (Ask in Chat First!)
Before writing code or pushing to GitHub, check if .env exists. If not, STOP and ask the user in the chat to reply with the following values (tell the user they can provide just #1 to start, and the rest are optional)

LLM API Key (Required - Primary & Fallback)

GEMINI_API_KEY (Free from Google AI Studio httpsaistudio.google.comappapikey)

OPENROUTER_API_KEY (From OpenRouter.ai - used as fallback when Gemini hits rate limit  error 429)

Telegram Notification (Optional - for instant push alerts to phone)

TELEGRAM_BOT_TOKEN (from @BotFather)

TELEGRAM_CHAT_ID (User's chat ID or group ID)

Google Sheets Webhook URL (Optional - only if user wants backup logging in Sheets)

GOOGLE_SHEETS_WEBHOOK_URL

Once the user replies in chat, immediately save these into .env (for local testing) and configure them as GitHub Actions Secrets.

PHASE 2 Project Directory Structure
Create the exact folder and file structure below

.
├── .github
│   └── workflows
│       └── radar-cron.yml       # Runs every 15 mins to fetch, filter, and commit JSON
├── scripts
│   └── fetch-and-analyze.mjs    # Zero-dependency Node 20+ script + AI Fallback mechanism
├── public
│   ├── index.html               # Mobile-first Dark Mode PWA UI
│   ├── app.js                   # Frontend logic + IndexedDB offline cache + Filter UI
│   ├── manifest.json            # PWA Manifest
│   ├── sw.js                    # Service Worker for Offline-First PWA
│   └── data
│       ├── news.json            # Curated AI news (auto-updated by Backend)
│       └── seen_hashes.json     # Deduplication cache (keeps last 500 IDs)
├── netlify.toml                 # Netlify Zero-Config deployment file
├── .gitignore                   # Ignore .env and node_modules
└── package.json                 # Minimal package config (type module)

PHASE 3 Backend Ingestion & AI Filtering (scriptsfetch-and-analyze.mjs)
Write scriptsfetch-and-analyze.mjs using pure Node.js (v20+ native fetch, fspromises, crypto) with ZERO npm dependencies.

3.1 Data Sources (No X Account Required, Fast as X)
Fetch concurrently using Promise.allSettled with a 10-second timeout per source

OpenRouter New Models API (JSON) [httpsopenrouter.aiapiv1models](httpsopenrouter.aiapiv1models) (Extract top 10 newest models. ID prefix or_)

HuggingFace Trending API (JSON) [httpshuggingface.coapimodelssort=trendingScore&direction=-1&limit=10](httpshuggingface.coapimodelssort=trendingScore&direction=-1&limit=10) (ID prefix hf_)

Hacker News AI Firehose via Firebase (JSON) [httpshacker-news.firebaseio.comv0topstories.json](httpshacker-news.firebaseio.comv0topstories.json) (Filter titles matching regex b(AILLMGPTClaudeAnthropicOpenAIDeepSeekGeminiHermesNousAgentMCPOpenRouterQwenLlama)bi. ID prefix hn_)

Bluesky Public API (AI Researchers & Official Mirrors) [httpspublic.api.bsky.appxrpcapp.bsky.feed.getAuthorFeedactor=simonwillison.net&limit=5](httpspublic.api.bsky.appxrpcapp.bsky.feed.getAuthorFeedactor=simonwillison.net&limit=5) (ID prefix bsky_)

Google News RSS Realtime Bypass (X.com & Official Blogs) [httpsnews.google.comrsssearchq=sitex.com](httpsnews.google.comrsssearchq=sitex.com)+(OpenAI+OR+Anthropic+OR+Claude+OR+DeepSeek+OR+Gemini)&hl=en-US&gl=US&ceid=USen (Parse with clean Regex).

3.2 Deduplication Logic
Read publicdataseen_hashes.json. Filter out items whose Unique ID is already present.

If 0 new items are found, log No new AI items found. and exit cleanly (process.exit(0)).

Append new Unique IDs and trim array to keep only the latest 500 IDs.

3.3 AI Summarization & Scoring WITH FALLBACK MECHANISM
Implement an analyzeWithAI(prompt, env) function with strict fallback

Primary Try Google Gemini API ([httpsgenerativelanguage.googleapis.comv1betamodelsgemini-2.5-flashgenerateContentkey=$](httpsgenerativelanguage.googleapis.comv1betamodelsgemini-2.5-flashgenerateContentkey=$){env.GEMINI_API_KEY}).

Fallback (Auto-Switch) If Gemini fails (HTTP 429 Rate Limit, Network Error, or missing key), automatically catch the error and fallback to OpenRouter API ([httpsopenrouter.aiapiv1chatcompletions](httpsopenrouter.aiapiv1chatcompletions) using model nousresearchhermes-3-llama-3.1-405bfree or googlegemini-2.0-flash-expfree).

System Prompt Requirement for AI
Instruct the LLM to deduplicate overlapping news, evaluate impact for an AI Engineer, and output ONLY valid JSON in Thai

JSON
{
  events [
    {
      id unique_string,
      timestamp ISO-8601 string,
      score 9,
      vendor Anthropic  OpenAI  DeepSeek  Google  OpenSource  Tooling,
      category Model Release  Dev Tool  Benchmark  Research,
      title_th หัวข้อข่าวภาษาไทยสั้น กระชับ,
      summary_th สรุป 2-3 บรรทัด คืออะไร  ดีกว่าเดิมยังไง  เอาไปใช้อะไรต่อได้,
      url https...
    }
  ]
}
Rule Only include items with score = 5. Give score = 8 ONLY for major model releases, big APIAgentMCP updates, or major benchmarks.

3.4 Save Data & Trigger Push Notifications
Read publicdatanews.json, prepend new events, keep the latest 200 items, and write back.

If TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set Send Telegram alert for every event with score = 8.

If GOOGLE_SHEETS_WEBHOOK_URL is set POST new events to the webhook URL.

PHASE 4 Mobile-First Dark Mode PWA (public)
Build a sleek, ultra-fast, offline-first PWA

publicindex.html & publicapp.js

Theme Pure Dark Mode (#090d16 background, #111827 cards, emeraldcyan accents).

Offline-First On load, render cached news from IndexedDB in 0ms, then asynchronously fetch .datanews.jsont=${Date.now()} in the background and update UI.

Features Filter pills by Vendor (All, Claude, OpenAI, DeepSeek, Google, OpenSource, Tooling) and Minimum Score (Breaking 8+), search input, and manual refresh button.

publicmanifest.json & publicsw.js Standard PWA manifest and Service Worker caching static assets.

netlify.toml

Ini, TOML
[build]
  publish = public
  command = echo 'Static PWA Ready'

[[headers]]
  for = data
  [headers.values]
    Cache-Control = public, max-age=0, must-revalidate
    Access-Control-Allow-Origin = 
PHASE 5 GitHub Actions Automation (.githubworkflowsradar-cron.yml)
Create .githubworkflowsradar-cron.yml to run every 15 minutes

Trigger on schedule - cron '15    ' and workflow_dispatch.

Steps Checkout repository, setup Node 20, run node scriptsfetch-and-analyze.mjs with secrets mapped to environment variables, and commitpush changes to publicdatanews.json with commit message chore auto-update AI news [skip netlify] (to save Netlify build minutes!).

PHASE 6 Verification & Handover
Run node scriptsfetch-and-analyze.mjs locally once to test the AI fallback mechanism and verify publicdatanews.json is generated correctly with Thai summaries.

Commit all files using Conventional Commits and push to GitHub.

Provide a concise Thai summary instructing the user how to link the repo to Netlify and where to set GitHub Secrets.