/**
 * PDF SUPPORT
 * =============
 * On Claude, a PDF is sent almost exactly like an image — one content
 * block: { type: "document", source: { type: "base64", media_type:
 * "application/pdf", data } }. Claude then handles EVERYTHING itself
 * server-side: reads the text, looks at embedded charts/images, and
 * understands tables/layout, all from that one raw file.
 *
 * Groq has no equivalent single-call PDF ingestion. (Groq's SDK does
 * have a content part literally named "document", but checking its
 * actual type — { document: { data: {[key: string]: unknown} } } — it's
 * for passing arbitrary structured JSON as context, e.g. tool results.
 * It is NOT a file/PDF-upload mechanism. Confirmed no model accepts raw
 * PDF bytes directly.)
 *
 * So this has to be TWO manual steps instead of Claude's one:
 *   1. Extract the text ourselves (via `pdf-parse`, running fully
 *      locally — no API, no key)
 *   2. Send the extracted TEXT to the model as a normal text message
 *
 * The honest limitation: this only replicates the "read the text"
 * part of Claude's PDF support. Claude can also look directly at
 * embedded charts/images and understand visual table layout because it
 * treats PDF pages like images internally. Doing that here would mean
 * rendering each PDF page to a PNG and sending it through our vision
 * model (image-vision.js) instead of/alongside the extracted text — a
 * heavier pipeline we haven't built. For a mostly-text document (like
 * the lesson's actual earth.pdf — a 4-page "Earth - Wikipedia" export —
 * plain text extraction covers the common case, though it will miss the
 * infobox image and any charts on the page.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import { PDFParse } from 'pdf-parse';
import fs from 'node:fs';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

async function extractPdfText(path) {
  const buffer = fs.readFileSync(path);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

async function askAboutPdf(path, prompt) {
  const text = await extractPdfText(path);
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `${prompt}\n\n<document>\n${text}\n</document>`,
      },
    ],
  });
  return response.choices[0].message.content;
}

async function main() {
  const answer = await askAboutPdf('./earth.pdf', 'Summarize the document in one sentence.');
  console.log(answer);
}

main();
