create or replace function match_docs(
  query_embedding vector(1536),
  match_count int default 6,
  filter_key text default null,
  filter_value text default null
)
returns table (
  id bigint,
  doc_id text,
  chunk_id int,
  content text,
  metadata jsonb,
  score double precision
) language plpgsql as $$
begin
  return query
  select d.id, d.doc_id, d.chunk_id, d.content, d.metadata,
         1 - (d.embedding <=> query_embedding) as score
  from public.docs d
  where (filter_key is null or d.metadata->>filter_key = filter_value)
  order by d.embedding <=> query_embedding
  limit match_count;
end; $$;

notify pgrst, 'reload schema';
