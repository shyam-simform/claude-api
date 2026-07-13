/**
 * VECTOR DATABASE (a minimal one, built by hand)
 * =================================================
 * The full 5-step RAG flow:
 *   1. Chunk the text by section        -> chunkBySection()      (chunking.js)
 *   2. Generate embeddings for chunks   -> generateEmbedding()    (embeddings.js)
 *   3. Store embeddings in a vector store -> VectorIndex          (this file)
 *   4. Embed the user's question        -> generateEmbedding()    (embeddings.js)
 *   5. Search the store for the closest chunks -> store.search()  (this file)
 *
 * A "vector store" is really just: a list of (embedding, original text)
 * pairs, plus a search() that compares a query embedding against every
 * stored one and returns the closest matches. Real vector databases
 * (Pinecone, Chroma, pgvector, ...) add persistence and faster search
 * for millions of vectors — the underlying math is exactly this.
 *
 * We store the ORIGINAL TEXT alongside each embedding, not just the
 * numbers — the embedding is only useful for comparison; once you've
 * found the closest match, you need the real text to put in the prompt.
 */

import fs from 'node:fs';
import { chunkBySection } from './chunking.js';
import { generateEmbedding, cosineSimilarity } from './embeddings.js';

// Same shape as BM25Index (addDocument/search, taking raw text) so both
// can sit behind the same interface — see hybrid.js's Retriever, which
// treats any index with this shape interchangeably.
class VectorIndex {
  constructor() {
    this.vectors = [];
    this.metadata = [];
  }

  async addDocument(metadata) {
    const embedding = await generateEmbedding(metadata.content);
    this.vectors.push(embedding);
    this.metadata.push(metadata);
  }

  // Returns the top `k` closest matches, as { metadata, distance } pairs,
  // best match first. Lower distance = more similar (1 - cosine
  // similarity, so 0 = identical).
  async search(queryText, k = 5) {
    const queryEmbedding = await generateEmbedding(queryText);
    return this.vectors
      .map((vector, i) => ({
        metadata: this.metadata[i],
        distance: 1 - cosineSimilarity(queryEmbedding, vector),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k);
  }
}

async function main() {
  // 1. Chunk the text by section
  const text = fs.readFileSync('./report.md', 'utf8');
  const chunks = chunkBySection(text);

  // 2 & 3. Create a vector store and add each chunk (embeds internally)
  const store = new VectorIndex();
  for (const chunk of chunks) await store.addDocument({ content: chunk });

  // 4 & 5. Search the store for the most relevant chunks (embeds the
  // query internally too)
  const question = 'What did the software engineering dept do last year?';
  const results = await store.search(question, 2);

  console.log(`Question: "${question}"\n`);
  for (const { metadata, distance } of results) {
    console.log(distance.toFixed(4), '\n', metadata.content.slice(0, 200), '\n');
  }
}

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { VectorIndex };
