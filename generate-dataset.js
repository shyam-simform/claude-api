/**
 * GENERATING TEST DATASETS
 * =========================
 *
 * WHAT IS THIS?
 * Before you can objectively evaluate a prompt (see eval.js), you need
 * a set of realistic test inputs to run it against. Writing those by
 * hand works for 3 examples, but doesn't scale to 50 or 500. Instead,
 * we ask a model to GENERATE the test cases for us.
 *
 * EASY ANALOGY
 * You're a teacher building an exam. Instead of writing every question
 * yourself, you ask a teaching assistant: "Give me 5 sample questions
 * covering algebra, geometry, and word problems — keep them short."
 * The TA hands back a clean list. You didn't write the questions, but
 * you now have solid material to test whether your teaching works.
 * That TA-generated list is exactly what an eval dataset is — a batch
 * of realistic test inputs, generated instead of hand-typed.
 *
 * WHY A FAST/CHEAP MODEL FOR THIS STEP?
 * Generating test QUESTIONS is a much easier task than actually solving
 * them well. There's no reason to spend your best (slower, pricier)
 * model on it — save that model for the real work being evaluated, and
 * use a fast/cheap one just to churn out test cases.
 *
 * THE FLOW
 * 1. Write a prompt describing exactly what kind of test cases you want,
 *    and the exact JSON shape each one should have.
 * 2. Send it to the model, get back a JSON array as text.
 * 3. Parse that text into a real JS array.
 * 4. Save it to a file (dataset.json) so eval.js can load it later
 *    instead of regenerating it every time.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import fs from 'fs';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// A small/fast model is enough here — we're generating test QUESTIONS,
// not solving a hard task, so there's no need for a bigger model.
const FAST_MODEL = 'llama-3.1-8b-instant';

async function generateDataset(count = 3) {
  const prompt = `Generate an evaluation dataset for testing a prompt that helps AWS users write Python code, JSON configuration, or regular expressions.

Return ONLY a raw JSON array (no markdown code fences, no extra text before or after) of ${count} objects, each shaped exactly like:
{ "task": "Description of task" }

Rules:
- Each task must be solvable with a single Python function, a single JSON object, or a single regex.
- Keep each task small — something that doesn't require much code to solve.`;

  const response = await groq.chat.completions.create({
    model: FAST_MODEL,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  let text = response.choices[0].message.content.trim();

  // Models sometimes wrap JSON in ```json ... ``` even when told not to —
  // strip that off before parsing, just in case.
  text = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  return JSON.parse(text);
}

async function main() {
  const dataset = await generateDataset(3);
  console.log('Generated dataset:');
  console.log(dataset);

  fs.writeFileSync('dataset.json', JSON.stringify(dataset, null, 2));
  console.log('\nSaved to dataset.json');
}

main();
