import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!);

const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const MAX_MATCHES = 8;

// WhatsApp URL (Arabic prefilled and URL-encoded)
const RAW_WA_TEXT = "مرحبا، أريد المساعدة في خدمات تمهيد";
const WHATSAPP_URL = `https://wa.me/96895525211?text=${encodeURIComponent(RAW_WA_TEXT)}`;

const SYSTEM = `You are a helpful assistant that answers ONLY from the provided context.
If the answer is not in the context, say "NO_ANSWER". Keep answers concise and in the same language as the user.`;

/* ---------- Flexible parser: supports JSON, form, and text ---------- */
async function parseBody(req: Request) {
  const ct = req.headers.get("content-type") || "";

  // JSON
  if (ct.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      /* ignore parse errors */
    }
  }

  // Form data (x-www-form-urlencoded)
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }

  // Fallback: try parsing text body or query string (?q=)
  try {
    const text = await req.text();
    if (text) return JSON.parse(text);
  } catch {
    /* ignore */
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  return q ? { q } : {};
}

/* ---------- Main handler ---------- */
export async function POST(req: Request) {
  const t0 = Date.now();
  let logId: number | null = null;

  try {
    const body = await parseBody(req);
    const q = body.q;
    const topK = body.topK ? Number(body.topK) : 6;
    const lang = body.lang || "ar";
    const sessionId = body.sessionId ?? null;

    if (!q || typeof q !== "string" || !q.trim()) {
      return NextResponse.json({ error: "Question required" }, { status: 400 });
    }

    // Step 1 — Embed query
    const emb = await openai.embeddings.create({ model: EMBED_MODEL, input: q });
    const query_embedding = emb.data[0].embedding;

    // Step 2 — Retrieve matches from Supabase
    const { data: matches, error } = await db.rpc("match_docs", {
      query_embedding,
      match_count: Math.min(topK, MAX_MATCHES),
      filter_key: lang ? "lang" : null,
      filter_value: lang || null,
    });
    if (error) throw error;

    const sources = (matches || []).map((m: any) => ({
      source_url: m?.metadata?.source_url || m?.metadata?.source || null,
      chunk_id: m?.chunk_id ?? null,
      score: m?.score ?? null,
    }));

    // Step 3 — Build context
    const context = (matches || [])
      .map(
        (m: any, i: number) =>
          `[[${i + 1}]]\n${m.content}\n(Source: ${
            m.metadata?.source_url || m.metadata?.source || "N/A"
          })`
      )
      .join("\n\n");

    // Step 4 — Ask OpenAI
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Context:\n\n${context}\n\nQuestion: ${q}` },
      ],
      temperature: 0.2,
    });

    let answer = chat.choices?.[0]?.message?.content?.trim() || "";

    // Step 5 — Fallback (WhatsApp)
    const noAnswer =
      !answer ||
      /no_answer/i.test(answer) ||
      /I don't know/i.test(answer) ||
      /لا أعرف/i.test(answer) ||
      /لا أملك/i.test(answer);

    if (noAnswer) {
      answer = `لم أجد إجابة دقيقة في قاعدة المعرفة. يمكنك التواصل معنا عبر واتساب للمزيد من التفاصيل: [اضغط هنا للتواصل](${WHATSAPP_URL})`;
    }

    const latency_ms = Date.now() - t0;

    // Step 6 — Log the query to Supabase (server-side only)
    const { data: inserted } = await admin
      .from("chat_logs")
      .insert({
        session_id: sessionId,
        question: q,
        answer,
        lang,
        topk: topK,
        model: "gpt-4o-mini",
        embed_model: EMBED_MODEL,
        latency_ms,
        sources,
        error: null,
      })
      .select("id")
      .single();

    logId = inserted?.id ?? null;

    // Step 7 — Return
    return NextResponse.json({ answer, matches, logId });
  } catch (e: any) {
    const latency_ms = Date.now() - t0;
    try {
      await admin.from("chat_logs").insert({
        question: "(parse failed)",
        answer: null,
        lang: null,
        topk: null,
        model: "gpt-4o-mini",
        embed_model: EMBED_MODEL,
        latency_ms,
        sources: null,
        error: e?.message || String(e),
      });
    } catch {}
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
