create extension if not exists vector;

create table if not exists public.docs (
  id        bigserial primary key,
  doc_id    text not null,
  chunk_id  int  not null,
  content   text not null,
  metadata  jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null
);

create unique index if not exists docs_unique_doc_chunk
  on public.docs (doc_id, chunk_id);

drop index if exists docs_embedding_hnsw;
create index if not exists docs_embedding_hnsw
  on public.docs using hnsw (embedding vector_cosine_ops);
