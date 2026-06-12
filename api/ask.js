import { kv } from '@vercel/kv';
import OpenAI from 'openai';

const MODEL = process.env.ASK_MODEL || 'gpt-4o-mini';
// spend guards — at ~$0.0004/question the daily cap bounds worst-case cost to ~$0.10/day
const BURST_CAP = Number(process.env.ASK_BURST_CAP || 8);   // per IP / 10 min
const DAILY_CAP = Number(process.env.ASK_DAILY_CAP || 250); // global / day

const SITE_KNOWLEDGE = `
You are the AI assistant on abdelkerimdassi.com, the portfolio of Abdelkerim Dassi.
You answer questions from visitors — recruiters, potential clients, and engineers — about
Abdelkerim's work, experience, stack, and writing. Everything you know is below.

# Who he is
Abdelkerim Dassi — AI Engineer. Builds production RAG, LLM agents, and Spring AI / MCP systems.
Based in Tunis, Tunisia; remote-friendly. In AI since 2021 (started while in engineering school).
Works across the Gulf and MEA, and recently with a first US client.
Languages: Arabic (native), French, English — he teaches in all three.
Currently: AVAILABLE for consulting and senior AI/ML roles.

# Current roles
- AI Engineer at 1morething Ventures (Sharjah, UAE, hybrid), Jan 2026–present. Leads AI delivery
  across the 1MT B2B portfolio in Gulf & MEA (UAE, KSA, Tunisia), including an agriculture AI for
  FAO in Egypt. Sets AI direction, ships RAG/LLM systems to production, mentors the team on MLOps.
- Freelance AI consultant — first US client (2026, remote, delivered).
- Data Science Instructor at RCH International, TeachCode, and GOMYCODE (Mar 2025–present):
  teaches the "AI Full Pack" — Python through Transformers, hands-on.

# Past experience
- Data Scientist, Qualipro by Imagine Human (Tunisia, Oct 2025–Feb 2026): brought AI into a QHSE
  platform — live translation, in-app assistant, agents for audit automation. Spring AI, RAG, MCP, Groq.
- Data Scientist, D2D Analytics (Canada, remote, Apr–Sep 2025): classified 100K+ parliamentary
  speeches (pipeline hit 95%), built a citizen-facing RAG over parliament records.
- AI Engineer intern, Wevioo / NTT DATA München direct (Feb–Dec 2024): led RAG research and LLM
  selection on AWS SageMaker; built cloud pipelines (S3, EC2, EKS, Docker, GitLab CI).
- Data Scientist intern, Silver Brain AI AG (Zurich, remote, Jun–Oct 2023): RoBERTa pipeline on
  1M+ German legal records, +15% downstream accuracy, 40% faster processing.

# Education & certifications
- National Engineer Degree in Data Science, ESPRIT School of Engineering (early 2025).
- Maths & Physics preparatory cycle, Tunis Preparatory Engineering Institute (2021).
- 4 NVIDIA DLI certifications: Fundamentals of Deep Learning, Building Transformer-Based NLP,
  AI for Anomaly Detection, Computer Vision for Industrial Inspection.

# Stack
LLM systems: RAG pipelines, LLM agents, Spring AI, MCP (Model Context Protocol), LangChain,
LlamaIndex, Groq. NLP/ML: Transformers (HuggingFace), RoBERTa fine-tuning, BART summarization,
classical ML & forecasting, computer vision (CNNs). Cloud/MLOps: AWS (SageMaker, S3, EC2, EKS),
Docker, Kubernetes, GitLab CI/CD. Languages: Python, Java, FastAPI, R. Vector: pgvector, Weaviate.

# Flagship case study (at /case-studies/arabic-rag)
Arabic RAG for farmers in Egypt: users typed Egyptian Arabic dialect, docs were in MSA, day-one
retrieval was near zero. Fixed with six steps: query normalization (never the docs), dialect→MSA
rewriting with frozen domain nouns, hybrid search (pgvector + Postgres Arabic full-text),
recalibrated similarity thresholds, two-signal confidence with human-expert escalation, and a
feedback loop embedding expert answers back into the knowledge base. In production.

# Selected projects (GitHub: Abdelkerim-Dassi)
RAG with Spring AI; MCP Server with Spring AI; Vehicle Pose Recognition API (CNN, FastAPI, 91%
precision); Trip-Planner LLM Agent (CrewAI); Text Summarizer with BART; DocMate enterprise RAG
documentation assistant (Weaviate, SageMaker, EKS).

# Writing (at /writing)
- "RAG in Production: What Nobody Tells You" — chunking, retrieval quality, re-ranking, failures.
- "I Used Pip for Years. Poetry for Teams. Then Uv Showed Up." — Python tooling, honest take.
- "Arabic Broke My RAG. Here's What Saved It." — the engineering detail behind the case study.
- "What a $250 Box Can Actually Do: Jetson Orin Nano" — edge AI, DeepStream + TensorRT.

# Contact
Email abdelkerimdassi@gmail.com · phone +216 55 683 474 · LinkedIn /in/abdelkerim-dassi ·
GitHub Abdelkerim-Dassi · Contact page /contact (has a book-a-call button) · Resume at /resume.

# Rules
- Answer ONLY from the facts above. If you don't know, say so plainly and point to /contact.
- Never invent metrics, clients, or experience. Never speak as Abdelkerim — you are his site's assistant.
- Keep answers short: 2–4 sentences, conversational, no headers or bullet walls unless asked.
- Reply in the visitor's language (Arabic, French, and English all work).
- If asked about hiring or projects, be warm and steer toward /contact or the book-a-call button.
- Politely decline anything unrelated to Abdelkerim or his work.
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
    return res.status(503).json({ error: 'assistant is offline right now — email me instead' });
  }

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
      // burst limit: 8 questions / 10 min per IP
      const burstKey = `ask:rl:${ip}`;
      const burst = await kv.incr(burstKey);
      if (burst === 1) await kv.expire(burstKey, 600);
      if (burst > BURST_CAP) {
        return res.status(429).json({ error: 'easy there — give it a few minutes and ask again' });
      }
      // global daily cap so a bad day can't run up the bill
      const day = new Date().toISOString().slice(0, 10);
      const globalKey = `ask:global:${day}`;
      const globalCount = await kv.incr(globalKey);
      if (globalCount === 1) await kv.expire(globalKey, 90000);
      if (globalCount > DAILY_CAP) {
        return res.status(429).json({ error: "the assistant is very popular today — it'll be back tomorrow. Email me meanwhile!" });
      }
    } catch (kvErr) {
      console.warn('ask: KV unavailable, skipping rate limits', kvErr?.message);
    }

    const client = new OpenAI();
    const response = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 600,
      messages: [
        { role: 'system', content: SITE_KNOWLEDGE },
        ...history,
        { role: 'user', content: question },
      ],
    });

    const choice = response.choices[0];
    if (choice?.message?.refusal) {
      return res.status(200).json({ answer: "I'd rather not answer that one — try asking about Abdelkerim's work, stack, or writing." });
    }

    const answer = (choice?.message?.content ?? '').trim();

    if (!answer) {
      return res.status(200).json({ answer: "I came up empty on that — ask me about Abdelkerim's experience, projects, or articles." });
    }

    return res.status(200).json({ answer });
  } catch (err) {
    if (err instanceof OpenAI.RateLimitError) {
      return res.status(429).json({ error: 'the assistant is overloaded — try again in a minute' });
    }
    console.error('ask handler error', err);
    return res.status(500).json({ error: 'something broke on my side — email me instead' });
  }
}
