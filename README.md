# Tamhid RAG App (Next.js + Supabase + OpenAI)

A minimal, ready-to-run app that:
- Ingests your content into Supabase (pgvector, 1536-dim for `text-embedding-3-small`)
- Exposes `/api/ask` for retrieval + answer synthesis (Arabic-ready)
- Includes a floating client-side chat widget that calls `/api/ask`

## 0) Prereqs
- Node 18+
- A Supabase project (URL + keys)
- OpenAI API key

## 1) Set up database (once)
Open Supabase SQL editor and run the files in **/sql** _in order_:

1. `01_table.sql`  – creates `public.docs` with `vector(1536)` and indexes
2. `02_rpc.sql`    – creates `match_docs` RPC for vector search
3. `03_policies.sql` (optional) – only if you want anon read access with RLS enabled

> If you change the table or RPC name, reflect it in `/app/api/ask/route.ts`.

## 2) Configure environment
Copy `.env.example` to `.env.local` and fill in values:
```bash
cp .env.example .env.local
# edit .env.local
```

## 3) Install deps & run dev
```bash
npm install
npm run dev
```
App: http://localhost:3000

## 4) Ingest your data
Put your Markdown (or text) file in `/scripts/data/`. Example included: `tamhid_services_markdown_ar.md` (placeholder).  
Then run:
```bash
node scripts/ingest.js ./scripts/data/tamhid_services_markdown_ar.md tamhid-services-v1 https://tamhid.sa/services
```

If you see `Chunks: >1` and batch upserts, ingestion worked.  
Verify quickly in SQL:
```sql
select count(*) from public.docs where doc_id = 'tamhid-services-v1';
select vector_dims(embedding) from public.docs limit 1; -- expect 1536
```

## 5) Ask questions
Use the widget (bottom-right) or call the API directly:
```bash
curl -X POST http://localhost:3000/api/ask   -H 'content-type: application/json'   -d '{"q":"ما خدمات هيئة الزكاة والضريبة والجمارك؟","topK":5,"lang":"ar"}'
```

## 6) Notes
- Default model: `text-embedding-3-small` (1536-dim) for embeddings, `gpt-4o-mini` for synthesis.
- Language filter default: `lang = ar` (change in widget prop or request body).
- `scripts/ingest.js` uses ESM and expects `SERVICE_ROLE` for upserts.
- If you alter SQL schema, run: `NOTIFY pgrst, 'reload schema';`
