/**
 * TEXT CHUNKING FOR RAG
 * =======================
 * RAG (Retrieval Augmented Generation) works by: split your documents
 * into small "chunks", find the chunks most relevant to a user's
 * question, and stuff only those into the prompt (instead of the whole
 * document). How you cut those chunks decides whether the right
 * information gets found at all.
 *
 * The classic failure case: a document has a medical section and a
 * software engineering section. The medical section happens to
 * mention the word "bug" (e.g. a literal insect in a research study).
 * If chunking is careless, a search for "bug" can retrieve the medical
 * chunk instead of the software one — wrong context in, wrong answer
 * out. See demonstrateChunkingProblem() below for this in action.
 *
 * Three strategies, in order of simplicity:
 *   1. Size-based    - cut every N characters, ignoring content
 *   2. Sentence-based - cut on sentence boundaries, group a few together
 *   3. Structure-based - cut on document structure (e.g. markdown headers)
 * (Semantic-based chunking — grouping sentences by meaning via NLP —
 * is the 4th, most sophisticated approach the lesson mentions, but
 * it needs real embeddings/NLP, which is a topic of its own.)
 */

// 1. SIZE-BASED — simplest, works on any text, but can cut words/sentences
// in half. `overlap` repeats a few trailing characters into the next chunk
// so context isn't lost right at the cut point.
function chunkByChar(text, chunkSize = 150, chunkOverlap = 20) {
  const chunks = [];
  let startIdx = 0;

  while (startIdx < text.length) {
    const endIdx = Math.min(startIdx + chunkSize, text.length);
    chunks.push(text.slice(startIdx, endIdx));
    startIdx = endIdx < text.length ? endIdx - chunkOverlap : text.length;
  }

  return chunks;
}

// 2. SENTENCE-BASED — a practical middle ground. Splits on sentence-ending
// punctuation, then groups a few sentences per chunk so cuts always land
// on a clean sentence boundary instead of mid-word.
function chunkBySentence(text, maxSentencesPerChunk = 5, overlapSentences = 1) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let startIdx = 0;

  while (startIdx < sentences.length) {
    const endIdx = Math.min(startIdx + maxSentencesPerChunk, sentences.length);
    chunks.push(sentences.slice(startIdx, endIdx).join(' '));
    startIdx += maxSentencesPerChunk - overlapSentences;
    if (startIdx < 0) startIdx = 0;
  }

  return chunks;
}

// 3. STRUCTURE-BASED — cleanest chunks, but only works when the document
// has reliable structure to split on (here: markdown "## " headers).
function chunkBySection(documentText) {
  return documentText.split(/\n## /).filter((chunk) => chunk.trim().length > 0);
}

function demonstrateChunkingProblem() {
  const document = `## Medical Research
Recent field studies observed how a rare beetle species, commonly called the "June bug", affects crop yields in tropical regions. Researchers tracked bug populations across three growing seasons.

## Software Engineering
Our engineering team fixed 214 bugs this year, most of them in the payment processing module. The bug tracker shows a steady decline in open issues quarter over quarter.`;

  console.log('=== Size-based chunking (chunkSize=150, overlap=20) ===');
  chunkByChar(document, 150, 20).forEach((chunk, i) => console.log(`[chunk ${i}]`, JSON.stringify(chunk)));

  console.log('\n=== Structure-based chunking (split on "## ") ===');
  chunkBySection(document).forEach((chunk, i) => console.log(`[chunk ${i}]`, JSON.stringify(chunk)));

  console.log('\n--- Why this matters ---');
  console.log(
    'A search for "bug" should only match the SOFTWARE chunk for a question like ' +
      '"how many bugs did engineers fix?" — but size-based chunking above cuts right through ' +
      'the middle of a section, so a chunk can contain a mix of both topics, confusing retrieval. ' +
      'Structure-based chunking keeps "Medical Research" and "Software Engineering" as two clean, ' +
      'separate chunks — a search for "bug" fixes can be scored against each whole topic, not a ' +
      'jumbled fragment of both.'
  );
}

function main() {
  demonstrateChunkingProblem();

  console.log('\n=== Sentence-based chunking demo ===');
  const text =
    'The cat sat on the mat. It looked out the window. Birds flew by outside. The cat watched intently. Suddenly it jumped down. It ran to the door. Someone was arriving home.';
  chunkBySentence(text, 3, 1).forEach((chunk, i) => console.log(`[chunk ${i}]`, JSON.stringify(chunk)));
}

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { chunkByChar, chunkBySentence, chunkBySection, demonstrateChunkingProblem };
