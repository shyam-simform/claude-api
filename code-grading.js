/**
 * CODE-BASED GRADING
 * ===================
 *
 * WHAT IS THIS?
 * So far our grading has been "read the answer, use judgment, give a
 * score" — like a teacher reading an essay. For CODE specifically,
 * there's a stronger, objective check we can do WITHOUT even asking a
 * model: does it actually parse?
 *
 * EASY ANALOGY
 * Think of it like a spell-checker vs. a teacher. A spell-checker
 * doesn't understand what your essay MEANS, but it catches a broken
 * word instantly, for free, with total certainty. Code-based grading
 * is that spell-checker layer for code: it doesn't judge whether the
 * logic is smart, it just checks "does this actually parse as valid
 * Python / JSON / Regex?" A model-based grader might read a broken
 * Python function and say "looks reasonable!" — a syntax check will
 * not be fooled, because it actually tries to parse the code.
 *
 * THE THREE VALIDATORS (deterministic — no API call, no cost, instant)
 * - JSON    -> try JSON.parse(text). Works = valid. Throws = broken.
 * - Python  -> JS has no built-in Python parser, so we shell out to
 *              a real Python interpreter (`python3 -c "import ast; ..."`)
 *              and check if it throws a SyntaxError.
 * - Regex   -> try `new RegExp(text)`. Works = valid. Throws = broken.
 * Each returns a score of 10 (parses) or 0 (doesn't parse) — no partial
 * credit, because syntax is binary: either it's valid or it isn't.
 *
 * THE FULL PICTURE — TWO GRADERS COMBINED
 * 1. Syntax grader (this file, code-based)  -> "does it parse?"
 * 2. Model grader  (run-eval.js, LLM judge)  -> "does it solve the task?"
 * 3. Combine: score = (modelScore + syntaxScore) / 2
 *    Equal weight to "is it correct code" and "does it solve the
 *    problem" — you can adjust this weighting if one matters more for
 *    your use case (e.g. weight syntax higher if broken code is a
 *    hard failure for you).
 *
 * WHY BOTHER, SINCE THE MODEL GRADER ALREADY GIVES A SCORE?
 * An LLM grader can be fooled by code that READS well but doesn't
 * actually run — confident-sounding prose about invalid code. The
 * syntax check has no opinion, no vibes — it just tries to parse the
 * text and reports pass/fail. Combining both catches more failure
 * modes than either alone.
 *
 * DATASET REQUIREMENT
 * Each test case now needs a "format" field so the syntax grader knows
 * which validator to use:
 *   { "task": "...", "format": "python" | "json" | "regex" }
 * (see generate-dataset.js, which now generates this field.)
 *
 * PROMPT CLARITY
 * To make the syntax check meaningful, the model's raw output needs to
 * BE the code — not code wrapped in an explanation. So the prompt below
 * is explicit: "respond with ONLY the code, no comments, no
 * explanation, no markdown fences." (Groq's chat API doesn't support
 * Anthropic-style assistant-message "prefill" continuation, so instead
 * of priming with "```code" we rely on a strict instruction, plus we
 * strip stray markdown fences afterward as a safety net.)
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import fs from 'fs';
import { execFileSync } from 'child_process';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = 'llama-3.1-8b-instant';

function addUserMessage(messages, text) {
  messages.push({ role: 'user', content: text });
}

async function chat(messages) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1000,
    messages,
  });
  return response.choices[0].message.content;
}

// Strip markdown code fences (```python ... ``` etc.) if the model adds
// them despite being told not to — keeps the syntax checks honest.
function stripCodeFences(text) {
  return text
    .trim()
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```$/, '')
    .trim();
}

// ---------------------------------------------------------------------
// 1. Merges the prompt and test case input, requesting RAW code only
// ---------------------------------------------------------------------
async function runPrompt(testCase) {
  const prompt = `
Please solve the following task:

${testCase.task}

Respond with ONLY the ${testCase.format} code that solves this task.
Do not add any comments, commentary, or explanation.
Do not wrap the code in markdown fences.
`;

  const messages = [];
  addUserMessage(messages, prompt);
  const output = await chat(messages);
  return stripCodeFences(output);
}

// ---------------------------------------------------------------------
// Syntax validators — deterministic, no API call, no cost
//
// QUICK REFERENCE — two graders, two different questions:
//   gradeSyntax()   -> "Does this parse?"        -> real parser, can't be wrong
//   gradeByModel()  -> "Does this solve the task?" -> LLM judgment, can be wrong
// Proven with a real example: an LLM asked "is this valid JSON?" said YES
// on `{"id":1,"name":"Alice",} ` (trailing comma) — JSON.parse() correctly
// threw. The LLM eyeballs code like a human skimming it; the parser
// enforces the actual grammar. That's why syntax checking is NOT done by
// asking the model — it's done by literally running a parser (below).
// ---------------------------------------------------------------------
function validateJson(text) {
  try {
    JSON.parse(text.trim());
    return 10;
  } catch {
    return 0;
  }
}

function validatePython(text) {
  try {
    // Shell out to a real Python interpreter to check syntax — JS has
    // no built-in Python parser. `ast.parse` throws SyntaxError on
    // invalid code and does nothing (exit code 0) on valid code.
    execFileSync('python3', ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'], {
      input: text,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    return 10;
  } catch {
    return 0;
  }
}

function validateRegex(text) {
  try {
    new RegExp(text.trim());
    return 10;
  } catch {
    return 0;
  }
}

// Picks the right validator based on the test case's expected format.
function gradeSyntax(output, testCase) {
  switch (testCase.format) {
    case 'json':
      return validateJson(output);
    case 'python':
      return validatePython(output);
    case 'regex':
      return validateRegex(output);
    default:
      throw new Error(`Unknown format: ${testCase.format}`);
  }
}

// ---------------------------------------------------------------------
// Model grader — "does the code actually solve the task?" (same idea
// as run-eval.js's gradeOutput, forced via function calling)
//
// This is JUDGMENT, not a fact-check — it can be wrong, unlike
// gradeSyntax() above. It exists to catch a DIFFERENT failure mode:
// code that parses fine but solves the wrong problem (e.g. a regex
// that's syntactically valid but doesn't enforce the actual rule
// asked for, like each IP octet being 0-255).
// ---------------------------------------------------------------------
async function gradeByModel(testCase, output) {
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
                description: '1-10 quality score. 10 = correctly and fully solves the task.',
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
        content: `You are grading whether a piece of ${testCase.format} code correctly solves a task.

Task: ${testCase.task}
Code: ${output}

Score how well the code solves the task from 1 to 10, ignoring formatting/style — focus on whether it does what was asked.`,
      },
    ],
  });

  const toolCall = response.choices[0].message.tool_calls[0];
  return JSON.parse(toolCall.function.arguments); // { score, reasoning }
}

// ---------------------------------------------------------------------
// 2. Runs one test case: get output, grade it two ways, combine scores
// ---------------------------------------------------------------------
async function runTestCase(testCase) {
  const output = await runPrompt(testCase);

  const modelGrade = await gradeByModel(testCase, output);
  const syntaxScore = gradeSyntax(output, testCase);

  // Equal weight to "solves the task" and "is valid syntax"
  const score = (modelGrade.score + syntaxScore) / 2;

  return {
    output,
    testCase,
    modelScore: modelGrade.score,
    modelReasoning: modelGrade.reasoning,
    syntaxScore,
    score,
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
  console.log(`Running code-graded eval on ${dataset.length} test case(s)...\n`);

  const results = await runEval(dataset);

  for (const r of results) {
    console.log(`- "${r.testCase.task}" [${r.testCase.format}]`);
    console.log(`    syntax score: ${r.syntaxScore}/10 (${r.syntaxScore === 10 ? 'parses OK' : 'FAILED TO PARSE'})`);
    console.log(`    model score:  ${r.modelScore}/10 (${r.modelReasoning})`);
    console.log(`    combined:     ${r.score.toFixed(1)}/10\n`);
  }

  const average = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  console.log(`Average combined score: ${average.toFixed(2)}`);
}

main();
