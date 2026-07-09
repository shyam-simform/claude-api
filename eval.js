/**
 * PROMPT EVALUATION WORKFLOW DEMO
 * =================================
 *
 * WHAT IS THIS?
 * A systematic way to test whether a prompt change actually makes
 * things better, instead of guessing. Instead of eyeballing a couple
 * of responses and going "yeah that looks nicer", you run BOTH prompt
 * versions across the same set of test questions, score every answer
 * objectively, and compare the average scores. Whichever version
 * scores higher, wins — no vibes required.
 *
 * THE 5 STEPS (implemented below, in order):
 *
 * 1. DRAFT A PROMPT
 *    Write the prompt template you want to test. It has a placeholder
 *    (`{question}`) that gets filled in per test case.
 *
 * 2. CREATE AN EVAL DATASET
 *    A list of sample questions representing what real users will ask.
 *    Small here (3 questions) — in production this could be hundreds.
 *
 * 3. FEED THROUGH THE MODEL
 *    For each question in the dataset: merge it into the prompt
 *    template, send it to the model, collect the answer.
 *
 * 4. FEED THROUGH A GRADER
 *    A SECOND model call that looks at (question, answer) and scores
 *    it 1–10. We use function calling here (see structured-data.js)
 *    to FORCE the grader to return a clean number instead of a sentence
 *    like "I'd give this an 8 out of 10" — much easier to average.
 *
 * 5. CHANGE PROMPT AND REPEAT
 *    Run the exact same dataset + grading process through a revised
 *    prompt, compare the new average score against the baseline.
 *
 * WHY BOTHER?
 * This turns prompt engineering from "does this feel better?" into
 * "is this number higher?" — an objective, repeatable measurement you
 * can use to confidently pick the best version of a prompt.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = 'llama-3.1-8b-instant';

// ---------------------------------------------------------------------
// Step 2: Eval dataset — sample questions representing real usage
// ---------------------------------------------------------------------
const EVAL_DATASET = [
  "What's 2+2?",
  'How do I make oatmeal?',
  'How far away is the Moon?',
];

// ---------------------------------------------------------------------
// Step 1: Prompt versions to compare
// ---------------------------------------------------------------------
const PROMPT_V1 = (question) => `
Please answer the user's question:

${question}
`;

const PROMPT_V2 = (question) => `
Please answer the user's question:

${question}

Answer the question with ample detail.
`;

// ---------------------------------------------------------------------
// Step 3: Feed a single question through the model
// ---------------------------------------------------------------------
async function askModel(promptText) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: promptText }],
  });
  return response.choices[0].message.content;
}

// ---------------------------------------------------------------------
// Step 4: Grade a single (question, answer) pair, 1-10
// Forced via function calling so we always get a clean number back,
// instead of parsing a sentence like "I'd rate this a 7/10".
// ---------------------------------------------------------------------
async function gradeAnswer(question, answer) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    tools: [
      {
        type: 'function',
        function: {
          name: 'submit_grade',
          description: 'Submit a quality score for an answer to a question.',
          parameters: {
            type: 'object',
            properties: {
              score: {
                type: 'number',
                description: '1-10 quality score. 10 = perfect answer, 1 = very poor.',
              },
              reasoning: {
                type: 'string',
                description: 'One short sentence explaining the score.',
              },
            },
            required: ['score', 'reasoning'],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'submit_grade' } },
    messages: [
      {
        role: 'user',
        content: `You are grading the quality of an AI assistant's answer.

Question: ${question}
Answer: ${answer}

Score the answer's quality from 1 to 10 (10 = perfect, correct, well-explained; 1 = wrong or unhelpful).`,
      },
    ],
  });

  const toolCall = response.choices[0].message.tool_calls[0];
  const { score, reasoning } = JSON.parse(toolCall.function.arguments);
  return { score, reasoning };
}

// ---------------------------------------------------------------------
// Steps 3+4 combined: run one prompt version across the whole dataset
// ---------------------------------------------------------------------
async function evaluatePrompt(promptLabel, buildPrompt) {
  console.log(`\n=== Evaluating: ${promptLabel} ===`);
  const results = [];

  for (const question of EVAL_DATASET) {
    const promptText = buildPrompt(question);
    const answer = await askModel(promptText);
    const { score, reasoning } = await gradeAnswer(question, answer);

    results.push({ question, answer, score, reasoning });
    console.log(`- "${question}" -> score ${score}/10 (${reasoning})`);
  }

  const average = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  console.log(`Average score for "${promptLabel}": ${average.toFixed(2)}`);
  return { promptLabel, results, average };
}

// ---------------------------------------------------------------------
// Step 5: Run both prompt versions and compare
// ---------------------------------------------------------------------
async function main() {
  const v1 = await evaluatePrompt('Prompt v1 (baseline)', PROMPT_V1);
  const v2 = await evaluatePrompt('Prompt v2 (added detail instruction)', PROMPT_V2);

  console.log('\n=== Comparison ===');
  console.log(`v1 average: ${v1.average.toFixed(2)}`);
  console.log(`v2 average: ${v2.average.toFixed(2)}`);
  console.log(
    v2.average > v1.average
      ? 'v2 wins — the added instruction improved answer quality.'
      : v2.average < v1.average
        ? 'v1 wins — the added instruction did not help (or hurt).'
        : 'Tie — no measurable difference.'
  );
}

main();
