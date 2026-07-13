/**
 * BM25 (LEXICAL SEARCH)
 * ========================
 * Semantic search (embeddings.js / vector-store.js) is great at
 * meaning, but bad at exact terms. Ask it to find "INC-2023-Q4-011"
 * and it might return a chunk that's conceptually related (another
 * incident report) instead of the chunk that actually CONTAINS that
 * exact ID — an embedding doesn't know an ID is special, it just sees
 * "some technical-sounding token."
 *
 * BM25 is the classic fix: pure keyword matching, but smarter than
 * "does this word appear" — it weights RARE terms far more than common
 * ones. "the" appears in every chunk and tells you nothing; a specific
 * incident ID appears in maybe 2 chunks out of 15 and is a strong
 * signal. That's the whole idea.
 *
 * The BM25 formula, per query term t, per document D:
 *   score(t, D) = idf(t) * (f(t,D) * (k1+1)) / (f(t,D) + k1*(1-b+b*|D|/avgdl))
 *   idf(t)      = ln((N - n(t) + 0.5) / (n(t) + 0.5) + 1)
 * where:
 *   f(t,D)  = how many times t appears in D
 *   |D|     = D's length in tokens, avgdl = average doc length
 *   N       = total number of documents, n(t) = how many documents contain t
 *   k1, b   = tuning constants (1.5 and 0.75 are standard defaults)
 *
 * Note the naming difference from vector-store.js: there, LOWER
 * distance = better match. Here, HIGHER score = better match — BM25
 * has no natural "0 to 1" scale, it's just a relevance ranking.
 */

const K1 = 1.5;
const B = 0.75;

function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9-]+/g) ?? [];
}

class BM25Index {
  constructor() {
    this.documents = []; // metadata, one per doc
    this.docTokens = []; // tokenized content, one per doc
    this.docFreq = new Map(); // term -> number of docs containing it
  }

  addDocument(metadata) {
    const tokens = tokenize(metadata.content);
    this.docTokens.push(tokens);
    this.documents.push(metadata);

    for (const term of new Set(tokens)) {
      this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
    }
  }

  search(query, k = 5) {
    const N = this.documents.length;
    const avgDocLength = this.docTokens.reduce((sum, t) => sum + t.length, 0) / N;
    const queryTerms = tokenize(query);

    const scored = this.documents.map((metadata, i) => {
      const tokens = this.docTokens[i];
      const docLength = tokens.length;

      const score = queryTerms.reduce((total, term) => {
        const termFreq = tokens.filter((t) => t === term).length;
        if (termFreq === 0) return total;

        const docsWithTerm = this.docFreq.get(term) ?? 0;
        const idf = Math.log((N - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);
        const numerator = termFreq * (K1 + 1);
        const denominator = termFreq + K1 * (1 - B + B * (docLength / avgDocLength));

        return total + idf * (numerator / denominator);
      }, 0);

      return { metadata, score };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

async function main() {
  const fs = await import('node:fs');
  const { chunkBySection } = await import('./chunking.js');

  const text = fs.readFileSync('./report.md', 'utf8');
  const chunks = chunkBySection(text);

  const store = new BM25Index();
  for (const chunk of chunks) store.addDocument({ content: chunk });

  const query = 'What happened with INC-2023-Q4-011?';
  const results = store.search(query, 3);

  console.log(`Query: "${query}"\n`);
  console.log('(higher score = better match, unlike vector-store.js\'s distance)\n');
  for (const { metadata, score } of results) {
    console.log(score.toFixed(4), '\n', metadata.content.slice(0, 200), '\n----');
  }
}

main();

export { BM25Index };
