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

class VectorIndex {
  constructor() {
    this.vectors = [];
    this.metadata = [];
  }

  addVector(embedding, metadata) {
    this.vectors.push(embedding);
    this.metadata.push(metadata);
  }

  // Returns the top `k` closest matches, as { metadata, distance } pairs.
  // Lower distance = more similar (1 - cosine similarity, so 0 = identical).
  search(queryEmbedding, k = 5) {
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

  // 2. Generate embeddings for all chunks in one batched call
  const embeddings = await generateEmbedding(chunks);

  // 3. Create a vector store and add each embedding + its original text
  const store = new VectorIndex();
  embeddings.forEach((embedding, i) => store.addVector(embedding, { content: chunks[i] }));

  // 4. Generate an embedding for the user's question
  const question = 'What did the software engineering dept do last year?';
  const questionEmbedding = await generateEmbedding(question);

  // 5. Search the store for the most relevant chunks
  const results = store.search(questionEmbedding, 2);

  console.log(`Question: "${question}"\n`);
  for (const { metadata, distance } of results) {
    console.log(distance.toFixed(4), '\n', metadata.content.slice(0, 200), '\n');
  }
}

main();

export { VectorIndex };
