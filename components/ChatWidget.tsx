"use client";
import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

type Msg = {
  role: "assistant" | "user";
  content: string;
  sources?: string[];
  done?: boolean;
  logId?: number | null;
};

type AskResponse = {
  answer?: string;
  matches?: Array<{
    metadata?: { source_url?: string; source?: string };
    chunk_id?: number;
    score?: number;
  }>;
  logId?: number | null;
  error?: string;
};

export default function ChatWidget({
  endpoint = "/api/ask",
  topK = 6,
  lang = "ar",
  title = "اسأل عن خدماتنا",
  showHeader = false,
  showFooter = false,
  className = "",
}: {
  endpoint?: string;
  topK?: number;
  lang?: string;
  title?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  className?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "مرحباً! اسألني أي شيء عن خدمات تمهيد.", done: true },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const ask = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q, done: true }]);
    setLoading(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q, topK, lang }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: AskResponse = await res.json();

      // Build a typed string[] of distinct sources
      const srcs = (data.matches ?? [])
        .map((m) => m?.metadata?.source_url ?? m?.metadata?.source)
        .filter((v): v is string => typeof v === "string" && v.length > 0);
      const sources: string[] = Array.from(new Set<string>(srcs));

      const fullText = String(data.answer || "").trim();
      typeOut(fullText, sources, data.logId ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      typeOut(`حدث خطأ: ${msg}`, [], null);
    } finally {
      setLoading(false);
    }
  };

  // Typewriter reveal
  const typeOut = (fullText: string, sources: string[] = [], logId: number | null = null, cps = 32) => {
    setMessages((m) => [...m, { role: "assistant", content: "", sources, done: false, logId }]);

    let i = 0;
    const interval = setInterval(() => {
      i = Math.min(i + Math.max(1, Math.round(cps / 2)), fullText.length);
      setMessages((m) => {
        const last = [...m];
        const idx = last.findIndex((msg) => msg.role === "assistant" && msg.done === false);
        if (idx !== -1) last[idx] = { ...last[idx], content: fullText.slice(0, i) };
        return last;
      });
      if (i >= fullText.length) {
        clearInterval(interval);
        setMessages((m) => {
          const last = [...m];
          const idx = last.findIndex((msg) => msg.role === "assistant" && msg.done === false);
          if (idx !== -1) last[idx] = { ...last[idx], done: true };
          return last;
        });
      }
    }, 30);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask();
    }
  };

  return (
    <div dir="rtl" lang="ar" className={`border rounded-2xl shadow-lg bg-white p-4 font-[inherit] ${className}`}>
      {showHeader && (
        <div className="flex items-center gap-2 mb-3 justify-end">
          <div className="font-semibold text-sm">{title}</div>
          <div className="h-8 w-8 rounded-full bg-black text-white grid place-items-center text-sm">AI</div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[420px]">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} sources={m.sources} done={m.done}>
            {m.content}
          </Bubble>
        ))}
        {loading && <TypingBubble />}
      </div>

      <div className="mt-3 flex flex-row-reverse items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="اكتب سؤالك هنا…"
          className="flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 text-right"
        />
        <button onClick={ask} disabled={loading || !input.trim()} className="rounded-xl px-3 py-2 text-sm bg-black text-white disabled:opacity-50">
          إرسال
        </button>
      </div>

      {showFooter && <div className="mt-2 text-[10px] text-gray-400 text-center">تمهيد × Supabase × OpenAI</div>}
    </div>
  );
}

/* -------------------- Typing indicator -------------------- */
function TypingBubble() {
  return (
    <div className="max-w-[85%] ml-auto">
      <div className="rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm border bg-gray-50 text-black text-right inline-flex items-center gap-2">
        <span>يكتب</span>
        <TypingDots />
      </div>
    </div>
  );
}

function TypingDots() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? "." : d + ".")), 350);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-4 text-center">{dots}</span>;
}

/* -------------------- Message bubble -------------------- */
function Bubble({
  role,
  children,
  sources,
  done = true,
}: {
  role: "assistant" | "user";
  children: React.ReactNode;
  sources?: string[];
  done?: boolean;
}) {
  const isUser = role === "user";
  const text = String(children);

  // Detect WhatsApp fallback link (already URL-encoded)
  const whatsappRegex = /(https:\/\/wa\.me\/\d+\?text=[^\s)]+)/;
  const hasWhatsApp = done && whatsappRegex.test(text);
  const match = hasWhatsApp ? text.match(whatsappRegex) : null;

  return (
    <div className={`max-w-[85%] ${isUser ? "mr-auto" : "ml-auto"}`}>
      <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm border text-right ${isUser ? "bg-black text-white border-black" : "bg-gray-50 text-black"}`}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : hasWhatsApp ? (
          <div className="flex flex-col items-center space-y-3">
            <ReactMarkdown components={{ p: ({ node, ...props }) => <p className="mb-2 text-center leading-relaxed" {...props} /> }}>
              {text.replace(whatsappRegex, "").trim()}
            </ReactMarkdown>
            <a
              href={match![1]}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-full shadow transition"
            >
              {/* WhatsApp icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 32 32" fill="currentColor">
                <path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.7 2 6.7L4 29l7.6-2c1.9 1 4.1 1.5 6.4 1.5 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-2 0-3.9-.5-5.5-1.5l-.4-.2-4.5 1.2 1.2-4.4-.3-.4C5.8 17.7 5.2 16.4 5.2 15c0-5.9 4.9-10.8 10.8-10.8 5.9 0 10.8 4.9 10.8 10.8S21.9 24.8 16 24.8z"/>
                <path d="M21.3 18.9c-.3-.2-1.7-.8-2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.3-.7.1-.4-.2-1.5-.6-2.8-1.9-1-1-1.7-2.3-1.9-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.6-.6.2-.2.3-.3.4-.5.1-.2 0-.4 0-.6s-.7-1.6-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.3 3.1 1.5 3.3c.2.3 2.6 4 6.3 5.5.9.4 1.7.6 2.3.8.9.3 1.7.2 2.3.1.7-.1 2.1-.9 2.4-1.7.3-.8.3-1.5.2-1.7-.1-.2-.3-.3-.6-.5z"/>
              </svg>
              تواصل عبر واتساب
            </a>
          </div>
        ) : (
          <ReactMarkdown
            components={{
              a: ({ node, ...props }) => <a {...props} className="text-green-600 hover:underline" target="_blank" rel="noreferrer" />,
              p: ({ node, ...props }) => <p className="mb-2" {...props} />,
            }}
          >
            {text}
          </ReactMarkdown>
        )}
      </div>

      {/* Sources */}
      {!isUser && Array.isArray(sources) && sources.length > 0 && done && (
        <div className="mt-1 flex flex-wrap justify-end gap-1">
          {sources.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noreferrer" className="text-[10px] rounded-full border px-2 py-0.5 text-gray-500 hover:bg-gray-100">
              مصدر {i + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
