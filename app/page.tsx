"use client";
import ChatWidget from "../components/ChatWidget";
export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-transparent" dir="rtl" lang="ar">
      <ChatWidget endpoint="/api/ask" topK={6} lang="ar" showHeader={false} showFooter={false} className="w-full max-w-xl" />
    </main>
  );
}
  