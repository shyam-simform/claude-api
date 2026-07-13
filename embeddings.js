/**
 * TEXT EMBEDDINGS + SEMANTIC SEARCH
 * ====================================
 * An embedding turns text into a list of numbers that captures its
 * MEANING. Similar meanings -> similar numbers. This lets you compare
 * a user's question against every chunk of a document mathematically,
 * instead of just matching exact words — which is how semantic search
 * avoids the "bug" mixup from chunking.js (medical bug vs. software bug
 * are worded almost identically, but mean very different things).
 *
 * Neither Anthropic nor Groq currently offer an embeddings model
 * (confirmed: Groq's SDK has an embeddings.create() method, but the
 * actual model it points to, nomic-embed-text-v1_5, 404s — it isn't
 * hosted). The lesson's fix is VoyageAI (a separate paid/free-tier
 * service, its own API key). Instead, we run a small embedding model
 * FULLY LOCALLY via @xenova/transformers — no signup, no API key, no
 * network call at inference time (only the first run downloads the
 * model file and caches it).
 */

import { pipeline } from '@xenova/transformers';
import fs from 'node:fs';
import { chunkBySection } from './chunking.js';

// Loaded once, reused for every embedding call.
let embedderPromise;
function getEmbedder() {
  embedderPromise ??= pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return embedderPromise;
}

// Mirrors the lesson's generate_embedding(text) — same shape, local model.
async function generateEmbedding(text) {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Cosine similarity: 1 = identical meaning, 0 = unrelated, -1 = opposite.
// Since our embeddings are already normalized, this is just a dot product.
function cosineSimilarity(a, b) {
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

async function findMostRelevantChunk(question, chunks) {
  const questionEmbedding = await generateEmbedding(question);
  const chunkEmbeddings = await Promise.all(chunks.map((chunk) => generateEmbedding(chunk)));

  const scored = chunks.map((chunk, i) => ({
    chunk,
    score: cosineSimilarity(questionEmbedding, chunkEmbeddings[i]),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function main() {
  const text = fs.readFileSync('./report.md', 'utf8');
  const chunks = chunkBySection(text);
  console.log(`Split report.md into ${chunks.length} chunks by "## " headers.\n`);

  const question = 'How many bugs did engineers fix this year?';
  const ranked = await findMostRelevantChunk(question, chunks);

  console.log(`Question: "${question}"\n`);
  console.log('Chunks ranked by semantic similarity:');
  ranked.forEach(({ chunk, score }, i) => {
    const heading = chunk.split('\n')[0].slice(0, 60);
    console.log(`  #${i + 1}  score=${score.toFixed(4)}  ${heading}`);
  });

  console.log('\nTop match (this is what would get sent to the model as context):');
  console.log(ranked[0].chunk.slice(0, 300));
}

main();

export { generateEmbedding, cosineSimilarity, findMostRelevantChunk };
