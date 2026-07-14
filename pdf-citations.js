/**
 * PDF CITATIONS
 * ===============
 * Claude's citation structure: when it answers using your document, it
 * hands back structured proof of where each claim came from —
 *   cited_text          - the exact quote it's citing
 *   document_index/title - which document, if you sent more than one
 *   start/end_page_number - where in the document that quote appeared
 * This is what powers footnote-style [1] [2] links back to a real page.
 *
 * Groq has NO built-in equivalent — there's no "citations" mode on the
 * chat completions API at all. To get the same structure, we build our
 * own citation discipline in three steps:
 *   1. Extract text PAGE BY PAGE (pdf-parse gives us this — see
 *      pdf-support.js's plain version, which only got the whole-doc text)
 *   2. Answer the question in plain text, THEN in a SEPARATE forced tool
 *      call, ask the model to find page-numbered citations for that
 *      answer. (Originally tried one combined schema — "write the
 *      answer AND fill out structured citations in the same forced
 *      call" — but this small model kept writing the answer as raw
 *      prose ahead of the JSON, corrupting the tool call every time.
 *      Splitting it into two simpler calls fixed that.)
 *   3. VERIFY each citation ourselves — check the quoted text actually
 *      appears on the page the model claims it does. Claude's citations
 *      are guaranteed correct by its own internal grounding; ours are
 *      not automatically trustworthy just because they're structured,
 *      so we check them like any other model output.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import { PDFParse } from 'pdf-parse';
import fs from 'node:fs';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

async function extractPdfPages(path) {
  const buffer = fs.readFileSync(path);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.pages.map((page) => ({ pageNumber: page.num, text: page.text }));
}

const extractCitationsSchema = {
  type: 'function',
  function: {
    name: 'extract_citations',
    description:
      'Given an answer and the source document, finds which page each factual claim in the answer came from.',
    parameters: {
      type: 'object',
      properties: {
        citations: {
          type: 'array',
          description: 'One entry per claim in the answer that can be traced back to the source document.',
          items: {
            type: 'object',
            properties: {
              cited_text: {
                type: 'string',
                description: 'The exact text quoted from the document — must be copied verbatim, not paraphrased.',
              },
              page_number: { type: 'number', description: 'The page this quote appears on.' },
            },
            required: ['cited_text', 'page_number'],
          },
        },
      },
      required: ['citations'],
    },
  },
};

// The small model occasionally garbles this tool call (prefixing the
// JSON with stray prose) — same flaky-generation issue handled
// elsewhere (see prompt-evaluator.js's withRetry). Just retry.
async function createChatCompletion(params, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await groq.chat.completions.create(params);
    } catch (error) {
      if (error?.error?.error?.code !== 'tool_use_failed' || i === retries) throw error;
      console.log(`  (invalid tool call — retrying, attempt ${i}/${retries})`);
    }
  }
}

// Two separate calls instead of one combined schema — asking this
// small model to write free-form prose AND fill out structured JSON in
// the SAME forced tool call was unreliable (it kept writing the answer
// as raw prose ahead of the JSON, corrupting the tool call). Splitting
// "write the answer" (plain call) from "extract citations for it"
// (forced call) fixed that.
async function askWithCitations(path, question) {
  const pages = await extractPdfPages(path);
  const taggedText = pages.map((p) => `[page ${p.pageNumber}]\n${p.text}`).join('\n\n');
  const documentBlock = `<document>\n${taggedText}\n</document>`;

  const answerResponse = await createChatCompletion({
    model: MODEL,
    max_tokens: 500,
    temperature: 0.3,
    messages: [{ role: 'user', content: `${question}\n\n${documentBlock}` }],
  });
  const answer = answerResponse.choices[0].message.content;

  const citationsResponse = await createChatCompletion({
    model: MODEL,
    max_tokens: 1000,
    temperature: 0.3,
    messages: [
      {
        role: 'user',
        content: `Answer:\n${answer}\n\n${documentBlock}\n\nFind the page-numbered citations backing up each claim in the answer above.`,
      },
    ],
    tools: [extractCitationsSchema],
    tool_choice: { type: 'function', function: { name: 'extract_citations' } },
  });
  const { citations } = JSON.parse(citationsResponse.choices[0].message.tool_calls[0].function.arguments);

  return { answer, citations, pages };
}

// Checks each citation actually appears on the page it claims to —
// unlike Claude, nothing guarantees our model's citations are honest.
function verifyCitations({ citations, pages }) {
  return citations.map((citation) => {
    const page = pages.find((p) => p.pageNumber === citation.page_number);
    const verified = Boolean(page && page.text.includes(citation.cited_text));
    return { ...citation, verified };
  });
}

async function main() {
  const question = "How did Earth's atmosphere and oceans form?";
  const result = await askWithCitations('./earth.pdf', question);
  const verifiedCitations = verifyCitations(result);

  console.log(`Question: "${question}"\n`);
  console.log('Answer:', result.answer, '\n');
  console.log('Citations:');
  for (const { cited_text, page_number, verified } of verifiedCitations) {
    console.log(`  [page ${page_number}] ${verified ? '✓ verified' : '✗ NOT FOUND on that page'}`);
    console.log(`    "${cited_text}"`);
  }
}

main();
