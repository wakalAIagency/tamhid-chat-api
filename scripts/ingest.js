import 'dotenv/config'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'


const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })


const MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';
const DIMS  = parseInt(process.env.EMBED_DIMS || '1536', 10);


function normalizeWhitespace(s) {
return s
.replace(/\u00A0/g, ' ')
.replace(/[\t\f\r]+/g, ' ')
.replace(/ +/g, ' ')
.replace(/\s*\n\s*/g, '\n')
.trim()
}


function chunkText(text, { maxTokens = 500, overlapTokens = 100 } = {}) {
  const est = s => Math.ceil(s.length / 4); // rough char→token

  const normalized = text
    .replace(/\u00A0/g, ' ')
    .replace(/[\t\f\r]+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

  // 1) split by markdown-ish headings
  const byHeadings = normalized.split(/\n(?=#+\s+)/);

  // 2) then paragraphs or fallback to sentence slicing
  const segments = [];
  for (const block of byHeadings) {
    const paras = block.includes('\n\n') ? block.split(/\n{2,}/) : [block];
    for (const p of paras) {
      if (est(p) > maxTokens * 1.2) {
        const sents = p.split(/(?<=[\.!\?])\s+(?=[A-Z\u0600-\u06FF])/g);
        let buf = "";
        for (const s of sents) {
          const next = buf ? `${buf} ${s}` : s;
          if (est(next) > maxTokens && buf) {
            segments.push(buf.trim());
            buf = s;
          } else {
            buf = next;
          }
        }
        if (buf) segments.push(buf.trim());
      } else {
        segments.push(p.trim());
      }
    }
  }

  // 3) pack with overlap
  const chunks = [];
  let buf = [];
  let bufTok = 0;
  for (const seg of segments) {
    const t = est(seg);
    if (bufTok + t > maxTokens && buf.length) {
      chunks.push(buf.join('\n\n'));
      const tail = [];
      let tailTok = 0;
      for (let i = buf.length - 1; i >= 0 && tailTok < overlapTokens; i--) {
        tail.unshift(buf[i]);
        tailTok += est(buf[i]);
      }
      buf = [...tail, seg];
      bufTok = est(buf.join('\n\n'));
    } else {
      buf.push(seg);
      bufTok += t;
    }
  }
  if (buf.length) chunks.push(buf.join('\n\n'));
  return chunks;
}



function hashId(s) {
return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}


async function embedBatch(inputs) {
const { data } = await openai.embeddings.create({ model: MODEL, input: inputs })
return data.map((d) => d.embedding)
}

async function ingest({ filePath, docId, sourceUrl }) {
const raw = await fs.readFile(filePath, 'utf8')
const chunks = chunkText(raw)


console.log(`Chunks: ${chunks.length}`)


// Prepare inputs – include lightweight headers so each chunk is self-contained
const inputs = chunks.map((c, i) => `DOC:${docId}\nCHUNK:${i}\n\n${c}`)


const BATCH = 64
for (let i = 0; i < inputs.length; i += BATCH) {
const slice = inputs.slice(i, i + BATCH)
const embs = await embedBatch(slice)


const rows = embs.map((embedding, j) => {
const chunk_id = i + j
const content = chunks[chunk_id]
return {
doc_id: docId,
chunk_id,
content,
metadata: {
source: filePath,
source_url: sourceUrl || null,
lang: /[\u0600-\u06FF]/.test(content) ? 'ar' : 'en'
},
embedding
}
})

const { error } = await db.from('docs').upsert(rows, { onConflict: 'doc_id,chunk_id' })



if (error) throw error
console.log(`Upserted ${rows.length} rows (through chunk ${i + slice.length - 1})`)
}


console.log('Done.')
}



// --- run ---
const filePath = process.argv[2] || './tamhid_services.txt'
const docId = process.argv[3] || 'tamhid-services-v1'
const sourceUrl = process.argv[4] || 'https://tamhid.sa/services'


ingest({ filePath, docId, sourceUrl }).catch((e) => {
console.error(e)
process.exit(1)
})

