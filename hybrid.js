/**
 * HYBRID SEARCH (semantic + BM25, merged via Reciprocal Rank Fusion)
 * =====================================================================
 * VectorIndex (semantic) and BM25Index (lexical) now share the exact
 * same shape: addDocument(metadata) and search(queryText, k), each
 * returning results best-match-first. Because the interface matches,
 * Retriever can treat either one interchangeably — add a new search
 * method later (graph search, keyword search, whatever) and it plugs
 * in the same way, no changes needed to Retriever itself.
 *
 * Retriever runs a query through every index it wraps, then merges the
 * rankings with Reciprocal Rank Fusion (RRF) — NOT by comparing raw
 * scores directly (a vector "distance" and a BM25 "score" aren't on
 * the same scale, so averaging them would be meaningless). RRF instead
 * only looks at each result's RANK (1st, 2nd, 3rd...) in each index:
 *
 *   RRF_score(doc) = sum over every index i of  1 / (k_rrf + rank_i(doc))
 *
 * A document ranked highly by BOTH indexes gets a high combined score.
 * A document that only one index liked still gets some credit, just
 * less. k_rrf (60 is the common default) softens how much rank #1 vs.
 * rank #2 matters — smaller k_rrf makes rank differences count more.
 */

import fs from 'node:fs';
import { chunkBySection } from './chunking.js';
import { VectorIndex } from './vector-store.js';
import { BM25Index } from './bm25.js';

class Retriever {
  constructor(...indexes) {
    if (indexes.length === 0) throw new Error('At least one index must be provided');
    this.indexes = indexes;
  }

  async addDocument(document) {
    for (const index of this.indexes) await index.addDocument(document);
  }

  async search(queryText, k = 5, kRrf = 60) {
    // Ask each index for a deep candidate list — RRF needs to see every
    // document that showed up anywhere, not just each index's top few.
    const candidateDepth = Math.max(k, ...this.indexes.map((idx) => idx.documents?.length ?? idx.metadata?.length ?? k));
    const allResults = await Promise.all(this.indexes.map((idx) => idx.search(queryText, candidateDepth)));

    // Merge by content (our stand-in for a document ID, since none of
    // our indexes assign one) and accumulate each index's RRF contribution.
    const merged = new Map();
    for (const results of allResults) {
      results.forEach(({ metadata }, rank) => {
        const key = metadata.content;
        const entry = merged.get(key) ?? { metadata, score: 0 };
        entry.score += 1 / (kRrf + rank + 1); // rank is 0-indexed; rank 1 = index 0
        merged.set(key, entry);
      });
    }

    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }
}

async function main() {
  const text = fs.readFileSync('./report.md', 'utf8');
  const chunks = chunkBySection(text);

  const retriever = new Retriever(new VectorIndex(), new BM25Index());
  for (const chunk of chunks) await retriever.addDocument({ content: chunk });

  const query = 'What happened with INC-2023-Q4-011?';
  const results = await retriever.search(query, 3);

  console.log(`Query: "${query}"\n`);
  console.log('(higher RRF score = ranked well by one or both indexes)\n');
  for (const { metadata, score } of results) {
    console.log(score.toFixed(4), '\n', metadata.content.slice(0, 200), '\n----');
  }
}

main();

export { Retriever };
