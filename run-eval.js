/**
 * RUNNING TEST EVAL — building the pipeline in layers
 * =====================================================
 *
 * WHAT IS THIS?
 * This is the "skeleton" stage of an eval pipeline — before we plug in
 * real grading logic. The goal here is just to prove the PLUMBING
 * works: dataset in -> prompt merged with each test case -> sent to
 * the model -> results collected in a clean structure. The actual
 * scoring is a hardcoded placeholder (score = 10) for now. Real
 * grading (see eval.js, which uses function-calling to force a clean
 * 1-10 score) gets layered on top of this exact same skeleton later.
 *
 * THE THREE FUNCTIONS (each with one job — don't mix responsibilities)
 *
 * 1. runPrompt(testCase)
 *    Takes ONE test case, merges it into the prompt template, sends
 *    it to the model, and returns just the raw text output. Doesn't
 *    know or care about grading, datasets, or anything else — it only
 *    knows how to answer one task.
 *
 * 2. runTestCase(testCase)
 *    Orchestrates ONE full test case: calls runPrompt() to get an
 *    answer, then grades it (hardcoded to 10 for now — the TODO marks
 *    exactly where real grading logic will go next). Returns a single
 *    structured result object: { output, testCase, score }.
 *
 * 3. runEval(dataset)
 *    The top-level coordinator. Loops over every test case in the
 *    dataset, calls runTestCase() on each one, and collects all the
 *    results into a single array. This is the function you actually
 *    call to run a full evaluation.
 *
 * WHY BUILD IT IN THIS ORDER?
 * Each function is a thin, single-purpose layer on top of the one
 * below it (runEval -> runTestCase -> runPrompt). This makes it easy
 * to test each piece independently, and easy to swap out just ONE
 * layer later (e.g. replacing the hardcoded score in runTestCase with
 * a real grader) without touching the others.
 *
 * GRADING (now implemented — see gradeOutput() below)
 * Grading is just a SECOND model call whose only job is to judge the
 * first model call's answer. Think of it like a teacher marking
 * homework: read the question, read the student's answer, decide how
 * good it is and why, then write down a score. We hand the grader
 * both the original task AND the model's output, and ask it to score
 * 1-10.
 *
 * The tricky part: if we just ask "give me a score" in plain text, the
 * grader might reply with a sentence like "I'd say around an 8" —
 * annoying to parse reliably. So (same trick as structured-data.js) we
 * FORCE the grader to fill out a rigid schema via function calling:
 * { score: number, reasoning: string }. No sentence to parse, no
 * ambiguity — the grader has no choice but to hand back clean data.
 *
 * NOTE ON SPEED: the lesson mentions using a fast/cheap model (like
 * Claude Haiku) since running a full dataset takes real wall-clock
 * time — one model call per test case. We're already on
 * llama-3.1-8b-instant, which is Groq's fast/cheap tier, so no change
 * needed there.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import fs from 'fs';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = 'llama-3.1-8b-instant';

function addUserMessage(messages, text) {
  messages.push({ role: 'user', content: text });
}

function addAssistantMessage(messages, text) {
  messages.push({ role: 'assistant', content: text });
}

async function chat(messages) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1000,
    messages,
  });
  return response.choices[0].message.content;
}

// ---------------------------------------------------------------------
// 1. Merges the prompt and test case input, then returns the result
// ---------------------------------------------------------------------
async function runPrompt(testCase) {
  // Deliberately bare-bones — no formatting instructions yet, so the
  // model's answers will likely be more verbose than we'd want in
  // production. That's expected at this stage; we refine the prompt
  // later once we can actually measure quality with real grading.
  const prompt = `
Please solve the following task:

${testCase.task}
`;

  const messages = [];
  addUserMessage(messages, prompt);
  return chat(messages);
}

// ---------------------------------------------------------------------
// Grading — the "teacher" model call. Given the original task and the
// model's output, force a clean { score, reasoning } via function
// calling instead of hoping a free-text reply parses cleanly.
// ---------------------------------------------------------------------
async function gradeOutput(task, output) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    tools: [
      {
        type: 'function',
        function: {
          name: 'submit_grade',
          description: 'Submit a quality score for a solution to a task.',
          parameters: {
            type: 'object',
            properties: {
              score: {
                type: 'number',
                description: '1-10 quality score. 10 = perfect solution, 1 = wrong or unhelpful.',
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
        content: `You are grading the quality of a solution to a task.

Task: ${task}
Solution: ${output}

Score the solution's quality from 1 to 10 (10 = correct, complete, well-explained; 1 = wrong or unhelpful).`,
      },
    ],
  });

  const toolCall = response.choices[0].message.tool_calls[0];
  return JSON.parse(toolCall.function.arguments); // { score, reasoning }
}

// ---------------------------------------------------------------------
// 2. Calls runPrompt, then grades the result
// ---------------------------------------------------------------------
async function runTestCase(testCase) {
  const output = await runPrompt(testCase);

  // Real grading — replaces the old hardcoded `score = 10` placeholder.
  const { score, reasoning } = await gradeOutput(testCase.task, output);

  return {
    output,
    testCase,
    score,
    reasoning,
  };
}

// ---------------------------------------------------------------------
// 3. Loops over the dataset and calls runTestCase with each case
// ---------------------------------------------------------------------
async function runEval(dataset) {
  const results = [];

  for (const testCase of dataset) {
    const result = await runTestCase(testCase);
    results.push(result);
  }

  return results;
}

async function main() {
  const dataset = JSON.parse(fs.readFileSync('dataset.json', 'utf-8'));
  console.log(`Running eval on ${dataset.length} test case(s)...\n`);

  const results = await runEval(dataset);

  // Quick human-readable summary, then the full structured results.
  for (const r of results) {
    console.log(`- "${r.testCase.task}" -> score ${r.score}/10 (${r.reasoning})`);
  }
  const average = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  console.log(`\nAverage score: ${average.toFixed(2)}`);

  console.log('\nFull structured results:');
  console.log(JSON.stringify(results, null, 2));
}

main();
