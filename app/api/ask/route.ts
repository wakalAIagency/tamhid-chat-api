import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Read-only client (uses anon) for retrieval
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// Admin client (SERVICE_ROLE) for logging
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!);

const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const MAX_MATCHES = 8;

// WhatsApp fallback (URL-encoded Arabic text)
const RAW_WA_TEXT = "مرحبا، أريد المساعدة في خدمات تمهيد";
const WHATSAPP_URL = `https://wa.me/96895525211?text=${encodeURIComponent(RAW_WA_TEXT)}`;

const SYSTEM = `You are a helpful assistant that answers ONLY from the provided context.
If the answer is not in the context, say "NO_ANSWER". Keep answers concise and in the same language as the user.`;

export async function POST(req: Request) {
  const t0 = Date.now();
  let logId: number | null = null;

  try {
    const { q, topK = 6, lang = "ar", sessionId = null } = await req.json();
    if (!q || typeof q !== "string")
      return NextResponse.json({ error: "Missing q" }, { status: 400 });

    // 1) Embed
    const emb = await openai.embeddings.create({ model: EMBED_MODEL, input: q });
    const query_embedding = emb.data[0].embedding;

    // 2) Retrieve
    const { data: matches, error } = await db.rpc("match_docs", {
      query_embedding,
      match_count: Math.min(topK, MAX_MATCHES),
      filter_key: lang ? "lang" : null,
      filter_value: lang || null,
    });
    if (error) throw error;

    // Extract sources for logging
    const sources = (matches || []).map((m: any) => ({
      source_url: m?.metadata?.source_url || m?.metadata?.source || null,
      chunk_id: m?.chunk_id ?? null,
      score: m?.score ?? null,
    }));

    // 3) Build context → ask LLM
    const context = (matches || [])
      .map(
        (m: any, i: number) =>
          `[[${i + 1}]]\n${m.content}\n(Source: ${
            m.metadata?.source_url || m.metadata?.source || "N/A"
          })`
      )
      .join("\n\n");

    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Context:\n\n${context}\n\nQuestion: ${q}` },
      ],
      temperature: 0.2,
    });

    let answer = chat.choices?.[0]?.message?.content?.trim() || "";

    // 4) Fallback: WhatsApp button
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

    // 5) Log to Supabase (service role)
    const { data: inserted, error: logErr } = await admin
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

    if (logErr) {
      // Return to client anyway; logging shouldn't block user
      return NextResponse.json({ answer, matches, logId: null });
    }

    logId = inserted?.id ?? null;

    return NextResponse.json({ answer, matches, logId });
  } catch (e: any) {
    const latency_ms = Date.now() - t0;
    // Best-effort error log
    try {
      await admin.from("chat_logs").insert({
        session_id: null,
        question: "(parse failed or other)",
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
