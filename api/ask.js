import { kv } from '@vercel/kv';
import OpenAI from 'openai';

const MODEL = process.env.ASK_MODEL || 'gpt-4o-mini';
// spend guards: worst case ~$0.0005/question, so 1800/month stays under $1/month
const VISITOR_DAILY_CAP = Number(process.env.ASK_VISITOR_DAILY_CAP || 10); // per IP / day
const DAILY_CAP = Number(process.env.ASK_DAILY_CAP || 60);      // global / day
const MONTHLY_CAP = Number(process.env.ASK_MONTHLY_CAP || 1800); // global / calendar month

const SITE_KNOWLEDGE = `
You are the AI assistant on abdelkerimdassi.com, the portfolio of Abdelkerim Dassi.
You answer questions from visitors (recruiters, potential clients, and engineers) about
Abdelkerim's work, experience, stack, and writing. Everything you know is below.

# Who he is
Abdelkerim Dassi, AI Engineer. Builds production RAG, LLM agents, agent-evaluation tasks for
frontier models, and edge computer vision on NVIDIA Jetson. Based in Tunis, Tunisia.
In AI since 2021 (internships during engineering school), full-time since 2025.
Languages: Arabic (native), English (C1), French (C1), basic German. Teaches in English, French
and Tunisian.
Currently: OPEN TO FULL-TIME AI / ML ENGINEERING ROLES with relocation to the Gulf (UAE, Saudi
Arabia, Qatar), France and the EU, the UK, or the US. Needs an employer-sponsored work visa
(no foreign residency today). Notice period: 21 days. Also takes remote freelance projects.

# Current roles
- AI Team Lead, 1morething Studio (Tunis, Tunisia, hybrid), Feb 2026 to present. Owns the AI
  roadmap for every product in the studio's portfolio: validates architecture and model
  decisions, sets the AI service standards, reviews the AI services the team ships. Mentors 2 to
  4 engineers. Hands-on projects:
  * Absar: edge vision for a coffee chain in Riyadh, Saudi Arabia. Built all 11 on-device SOP
    checks (hygiene gear like hairnets, masks and gloves; uncovered drinks; milk left out; ice
    tank or back door open; steaming milk while looking away; drive-thru orders with no receipt),
    live on NVIDIA Jetson since Sep 2026, 8 cameras at 16 FPS. A GPU benchmark he ran made
    inference 17x faster (3.9 s to 225 ms). Retraining lifted cup-detector precision from 0.875
    to 0.992 (recall 0.66 to 0.845) and milk-detector precision from 12% to 83%; hairnet false
    flags fell from 3.7% to 0.2%. The live video stream stays in the store; only event records
    and one image per alert are uploaded. Team of four; others built the dashboard, app and
    release tooling.
  * SheGrows: WhatsApp RAG assistant for women farmers in Egypt, built for FAO, in production
    since July 2026. He built the Egyptian-dialect query rewriting, Arabic hybrid search,
    confidence routing and the expert feedback loop, in a team of four. It has answered 15K+
    questions from 100+ farmers; roughly four in five are answered without a human.
  * LegalTech: on-premise, air-gapped pipeline for scanned Arabic legal files, for a ministry.
    Proof of concept. Cut OCR time per line 45x (86 s to 1.9 s, identical output) on a 4 GB GPU;
    caught the OCR inventing text with higher confidence than real Arabic and filtered it out;
    every quote cites its exact page and line.
- AI Evaluation Engineer, freelance, for a US stealth startup (2026 to present): built about 40
  agentic evaluation tasks testing Anthropic's Claude Sonnet 5 and Opus 4.6 against real client
  software, with about an 80% acceptance rate. Also validated tasks for Qwen3 for another client.
- Data Science Instructor at RCH International, TeachCode, and GOMYCODE (Mar 2025 to present):
  the "AI Full Pack", Python through Transformers. 3 cohorts, about 50 students, mostly working
  professionals.

# Past experience
- Data Scientist, Qualipro by Imagine Human (Tunisia, Oct 2025 to Feb 2026): built a QHSE
  translation service in Spring AI + Groq covering 10 languages, exposed it as an A2A agent, and
  built a Spring AI MCP server on top; also shipped the in-app assistant and audit-automation
  agents. 301 automated tests, 9-stage GitLab CI.
- Data Scientist, D2D Analytics (Canada, remote, Apr to Sep 2025): classified 100K+ parliamentary
  speeches (pipeline hit 95%), built a citizen-facing RAG over parliament records.
- AI Engineer intern, Wevioo / NTT DATA Munich direct (Feb to Dec 2024): led RAG research and LLM
  selection on AWS SageMaker; built cloud pipelines (S3, EC2, EKS, Docker, GitLab CI).
- Data Scientist intern, Silver Brain AI AG (Zurich, remote, Jun to Oct 2023): RoBERTa pipeline on
  1M+ German legal records, +15% downstream accuracy, 40% faster processing.

# Education & certifications
- National Engineer Degree in Data Science, ESPRIT School of Engineering (2025).
- Maths & Physics preparatory cycle, Tunis Preparatory Engineering Institute (2021).
- 4 NVIDIA DLI certifications: Fundamentals of Deep Learning, Building Transformer-Based NLP,
  AI for Anomaly Detection, Computer Vision for Industrial Inspection.

# Stack
LLM systems: RAG (hybrid search, pgvector, re-ranking), LLM agents, agent evaluation, Spring AI,
MCP, A2A, LangChain, LlamaIndex, CrewAI, OpenAI / Azure OpenAI, Groq, Claude. Computer vision:
NVIDIA Jetson, DeepStream, TensorRT, detector and classifier training. NLP: Arabic and dialect
NLP, Arabic OCR, Transformers, RoBERTa. Cloud/MLOps: AWS (SageMaker, S3, EC2, EKS), Azure, Docker,
Kubernetes, GitLab CI/CD. Languages: Python, Java (Spring Boot), TypeScript, FastAPI.

# Case studies
- /case-studies/edge-cctv: Absar, edge vision in Riyadh (details above).
- /case-studies/arabic-rag: SheGrows, Arabic RAG for FAO Egypt (details above).

# Personal projects (built alone)
- Qirat, formerly called Signal Desk (live at signal-desk-psi.vercel.app): a rule engine scores 18 crypto coins and an
  LLM writes the briefing and answers in a streaming chat. Backtested over 35K+ coin-days since
  2021. FastAPI, React, Redis, Vercel.
- Also: Ahki (Tunisian Arabizi to Arabic, 0.75 token-F1 on held-out data), RAG and MCP with
  Spring AI (open source), DocMate enterprise RAG assistant, Voyagent (CrewAI trip planner).

# Writing (at /writing)
- "RAG in Production: What Nobody Tells You". Covers chunking, retrieval quality, re-ranking, failures.
- "I Used Pip for Years. Poetry for Teams. Then Uv Showed Up." A Python tooling piece, honest take.
- "Arabic Broke My RAG. Here's What Saved It." The engineering detail behind the SheGrows case study.
- "What a $250 Box Can Actually Do: Jetson Orin Nano". Edge AI, DeepStream + TensorRT.

# Contact
Email abdelkerimdassi@gmail.com · phone +216 55 683 474 · LinkedIn /in/abdelkerim-dassi ·
GitHub Abdelkerim-Dassi · Contact page /contact (has a book-a-call button) · Resume at /resume.

# Rules
- Answer ONLY from the facts above. If you don't know, say so plainly and point to /contact.
- Never invent metrics, clients, or experience. Never speak as Abdelkerim; you are his site's assistant.
- Keep answers short: 2 to 4 sentences, conversational, no headers or bullet walls unless asked.
- Reply in the visitor's language (Arabic, French, and English all work).
- If asked about hiring, say he is open to full-time roles with relocation and steer toward /contact,
  /resume, or the book-a-call button. Freelance questions go to /contact too.
- Politely decline anything unrelated to Abdelkerim or his work.
- Write plainly, the way a person texts. Never use em dashes; use commas, colons, or periods instead.
`.trim();

function ipFrom(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || 'unknown';
}

async function readBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'assistant is offline right now. Email me instead.' });
  }

  // set once the visitor's daily allowance is spent, so a failure can refund it
  let visitorKey = null;

  try {
    let body;
    try { body = await readBody(req); }
    catch { return res.status(400).json({ error: 'invalid json' }); }

    const question = String(body.question ?? '').trim().slice(0, 500);
    if (question.length < 2) {
      return res.status(400).json({ error: 'ask me something first' });
    }

    // last few turns from the client, sanitized
    const history = Array.isArray(body.history)
      ? body.history.slice(-6).map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content ?? '').slice(0, 1500),
        })).filter(m => m.content)
      : [];

    // rate limits live in KV; if no store is connected, run without them
    try {
      const ip = ipFrom(req);
      const day = new Date().toISOString().slice(0, 10);
      // per-visitor daily allowance
      visitorKey = `ask:rl:${ip}:${day}`;
      const visitorCount = await kv.incr(visitorKey);
      if (visitorCount === 1) await kv.expire(visitorKey, 90000);
      if (visitorCount > VISITOR_DAILY_CAP) {
        visitorKey = null;   // cap already spent; nothing to refund
        return res.status(429).json({ error: "you've used today's questions. Come back tomorrow, or just email me!" });
      }
      // global daily cap so a bad day can't run up the bill
      const globalKey = `ask:global:${day}`;
      const globalCount = await kv.incr(globalKey);
      if (globalCount === 1) await kv.expire(globalKey, 90000);
      if (globalCount > DAILY_CAP) {
        return res.status(429).json({ error: "the assistant is very popular today. It'll be back tomorrow. Email me meanwhile!" });
      }
      // hard monthly budget cap
      const month = day.slice(0, 7);
      const monthKey = `ask:month:${month}`;
      const monthCount = await kv.incr(monthKey);
      if (monthCount === 1) await kv.expire(monthKey, 3200000); // ~37 days
      if (monthCount > MONTHLY_CAP) {
        return res.status(429).json({ error: "the assistant hit its monthly budget. Email me instead, I reply within a day!" });
      }
    } catch (kvErr) {
      console.warn('ask: KV unavailable, skipping rate limits', kvErr?.message);
    }

    // retry transient upstream hiccups (overloaded / 5xx) a few times before giving up
    const client = new OpenAI({ maxRetries: 4, timeout: 30000 });
    const response = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 400,
      messages: [
        { role: 'system', content: SITE_KNOWLEDGE },
        ...history,
        { role: 'user', content: question },
      ],
    });

    const choice = response.choices[0];
    if (choice?.message?.refusal) {
      return res.status(200).json({ answer: "I'd rather not answer that one. Try asking about Abdelkerim's work, stack, or writing." });
    }

    const answer = (choice?.message?.content ?? '').trim();

    if (!answer) {
      return res.status(200).json({ answer: "I came up empty on that. Ask me about Abdelkerim's experience, projects, or articles." });
    }

    return res.status(200).json({ answer });
  } catch (err) {
    // the question never got answered — give the visitor their allowance back
    if (visitorKey) { try { await kv.decr(visitorKey); } catch (_) {} }

    // OpenAI returns 429 for BOTH a real rate-limit spike AND an out-of-credit account.
    // They need different messages: one clears on its own, the other never does.
    if (err instanceof OpenAI.RateLimitError) {
      if (err.code === 'insufficient_quota') {
        console.error('ask handler: OpenAI quota exhausted (check billing)', err?.message);
        return res.status(503).json({ error: "the assistant is resting right now. Email me instead, I reply within a day!" });
      }
      return res.status(429).json({ error: 'the assistant is busy right now. Give it a minute and try again.' });
    }
    // overloaded models and other upstream errors come back as 5xx after retries are spent
    if (err instanceof OpenAI.APIError && err.status >= 500) {
      console.error('ask handler: OpenAI upstream error', err?.status, err?.message);
      return res.status(503).json({ error: 'the assistant is busy right now. Give it a minute and try again.' });
    }
    console.error('ask handler error', err);
    return res.status(500).json({ error: 'something broke on my side. Email me instead.' });
  }
}
