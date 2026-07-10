/**
 * PROMPT EVALUATOR — reusable eval engine
 * ==========================================
 *
 * WHAT IS THIS?
 * Everything we've built so far (generate-dataset.js, run-eval.js,
 * code-grading.js, eval.js) gets consolidated here into one reusable
 * tool. Instead of copy-pasting the same pipeline into a new file every
 * time you want to test a prompt, you now:
 *
 *   1. Create ONE PromptEvaluator instance (this file, rarely touched)
 *   2. Generate a dataset once for the thing you're testing
 *   3. Write a `runPrompt(testCase)` function containing JUST the
 *      prompt you want to test
 *   4. Call `evaluator.runEvaluation(...)` and read the score
 *   5. Edit the prompt in step 3, run again, compare scores
 *
 * See prompt-lab.js for the "workbench" side of this — that's the file
 * you'll actually edit over and over as you try different prompts.
 *
 * WHAT'S NEW COMPARED TO THE EARLIER FILES?
 * - Generic inputs: earlier files assumed every test case had a
 *   `task` field. Here, test cases can have ANY shape you want
 *   (`promptInputsSpec` describes the fields), so this same engine
 *   works for coding prompts, chat prompts, extraction prompts, etc.
 * - Concurrency control: `maxConcurrentTasks` lets multiple test cases
 *   run in parallel instead of one-at-a-time. Keep this LOW (1-2) on
 *   Groq's free tier — we've already hit its tokens-per-minute rate
 *   limit running things sequentially, so parallel calls make that
 *   worse, not better. There's no free lunch here; concurrency trades
 *   wall-clock time for a higher chance of hitting 429s.
 * - Automatic retry on rate limits (429), since real usage will hit
 *   Groq's free-tier limits fairly often.
 * - Optional code-based grading: if a test case has a "format" field
 *   (python/json/regex), it's syntax-checked and combined with the
 *   model grade — same idea as code-grading.js, just generalized.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import fs from 'fs';
import { execFileSync } from 'child_process';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = 'llama-3.1-8b-instant';

// ---------------------------------------------------------------------
// Shared low-level helpers — used both internally AND by your own
// runPrompt functions in prompt-lab.js (same pattern as the notebook's
// global add_user_message / add_assistant_message / chat helpers).
// ---------------------------------------------------------------------
export function addUserMessage(messages, text) {
  messages.push({ role: 'user', content: text });
}

export function addAssistantMessage(messages, text) {
  messages.push({ role: 'assistant', content: text });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries on:
// - 429 (rate limit) — waits out Groq's tokens-per-minute limit
// - 400 tool_use_failed — the MODEL generated invalid JSON inside its
//   own tool call (e.g. an incorrectly escaped apostrophe like
//   `AI\'s`, which isn't valid JSON). Groq's server rejects the whole
//   request before we ever see the malformed text. This is flaky
//   generation, not a real error — a fresh attempt almost always
//   produces valid JSON, so we just ask again instead of crashing.
async function withRetry(fn, { retries = 5 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = error?.status === 429;
      const isToolUseFailed = error?.status === 400 && error?.error?.error?.code === 'tool_use_failed';
      if ((!isRateLimit && !isToolUseFailed) || attempt === retries) throw error;

      if (isRateLimit) {
        const match = /try again in ([\d.]+)s/i.exec(error?.error?.error?.message ?? '');
        const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 500 : 5000;
        console.log(`  (rate limited — waiting ${(waitMs / 1000).toFixed(1)}s before retrying)`);
        await sleep(waitMs);
      } else {
        console.log('  (model generated invalid tool-call JSON — retrying)');
      }
    }
  }
}

// Plain chat call — returns just the text, same shape as the notebook's
// chat() helper. This is what YOUR runPrompt functions should call.
export async function chat(messages, { temperature = 1.0 } = {}) {
  const response = await withRetry(() =>
    groq.chat.completions.create({
      model: MODEL,
      max_tokens: 1000,
      messages,
      temperature,
    })
  );
  return response.choices[0].message.content;
}

// Internal-only: chat call forced through a tool schema, for grading
// and dataset generation, where we need clean structured output.
async function chatForTool(messages, tool) {
  const response = await withRetry(() =>
    groq.chat.completions.create({
      model: MODEL,
      max_tokens: 500,
      messages,
      tools: [tool],
      tool_choice: { type: 'function', function: { name: tool.function.name } },
    })
  );
  const toolCall = response.choices[0].message.tool_calls[0];
  return JSON.parse(toolCall.function.arguments);
}

const SUBMIT_GRADE_TOOL = {
  type: 'function',
  function: {
    name: 'submit_grade',
    description: 'Submit a quality score for an AI output.',
    parameters: {
      type: 'object',
      properties: {
        score: { type: 'number', description: '1-10 quality score. 10 = perfect, 1 = wrong/unhelpful.' },
        reasoning: { type: 'string', description: 'One short sentence explaining the score.' },
      },
      required: ['score', 'reasoning'],
    },
  },
};

// ---------------------------------------------------------------------
// Code-based syntax validators (see code-grading.js for the full
// explanation of why these exist separately from the model grader)
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

function gradeSyntax(output, testCase) {
  switch (testCase.format) {
    case 'json':
      return validateJson(output);
    case 'python':
      return validatePython(output);
    case 'regex':
      return validateRegex(output);
    default:
      return null; // no "format" field -> no syntax grading for this test case
  }
}

// ---------------------------------------------------------------------
// Runs `items` through `worker`, at most `limit` running at once.
// A simple hand-rolled concurrency pool — no external dependency.
// ---------------------------------------------------------------------
async function runWithConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, runNext));
  return results;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreColor(score) {
  if (score >= 7) return '#1a7f37'; // green — pass
  if (score >= 4) return '#9a6700'; // amber — mediocre
  return '#cf222e'; // red — fail
}

// Renders results as a self-contained HTML report (summary cards + a
// full table), matching the "Prompt Evaluation Report" layout: Total
// Test Cases / Average Score / Pass Rate, then Prompt Inputs / Scenario
// / Solution Criteria / Output / Score / Reasoning per row.
function generateHtmlReport(results, outputFile) {
  const average = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const passCount = results.filter((r) => r.score >= 7).length;
  const passRate = (passCount / results.length) * 100;

  const rows = results
    .map((r) => {
      const { scenario, solutionCriteria, ...inputFields } = r.testCase;
      const promptInputsHtml = Object.entries(inputFields)
        .map(([key, value]) => `<b>${escapeHtml(key)}:</b> ${escapeHtml(JSON.stringify(value))}`)
        .join('<br>');
      const criteriaHtml = (solutionCriteria || '')
        .split('\n')
        .filter(Boolean)
        .map((line) => `${escapeHtml(line)}`)
        .join('<br>');

      return `
        <tr>
          <td>${promptInputsHtml}</td>
          <td>${escapeHtml(scenario || '')}</td>
          <td>${criteriaHtml}</td>
          <td><pre>${escapeHtml(r.output)}</pre></td>
          <td><span class="score-badge" style="background:${scoreColor(r.score)}">${r.score.toFixed(1)}</span></td>
          <td>${escapeHtml(r.modelReasoning || '')}</td>
        </tr>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Prompt Evaluation Report</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #ececec; margin: 0; padding: 32px; color: #1a1a1a; }
  h1 { font-size: 28px; margin-bottom: 24px; }
  .cards { display: flex; gap: 16px; margin-bottom: 24px; }
  .card { background: #fff; border-radius: 6px; padding: 16px 24px; flex: 1; }
  .card .label { font-size: 13px; color: #57606a; margin-bottom: 8px; }
  .card .value { font-size: 22px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th { background: #24292f; color: #fff; text-align: left; padding: 10px 12px; font-size: 13px; }
  td { padding: 12px; border-bottom: 1px solid #e0e0e0; vertical-align: top; font-size: 13px; }
  pre { white-space: pre-wrap; font-family: inherit; margin: 0; background: #f6f8fa; padding: 8px; border-radius: 4px; }
  .score-badge { display: inline-block; min-width: 24px; text-align: center; color: #fff; border-radius: 4px; padding: 2px 8px; font-weight: 600; }
</style>
</head>
<body>
  <h1>Prompt Evaluation Report</h1>
  <div class="cards">
    <div class="card"><div class="label">Total Test Cases</div><div class="value">${results.length}</div></div>
    <div class="card"><div class="label">Average Score</div><div class="value">${average.toFixed(1)} / 10</div></div>
    <div class="card"><div class="label">Pass Rate (&ge;7)</div><div class="value">${passRate.toFixed(1)}%</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Prompt Inputs</th>
        <th>Scenario</th>
        <th>Solution Criteria</th>
        <th>Output</th>
        <th>Score</th>
        <th>Reasoning</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(outputFile, html);
  console.log(`HTML report written -> ${outputFile}`);
}

// =======================================================================
// PromptEvaluator
// =======================================================================
export class PromptEvaluator {
  constructor({ maxConcurrentTasks = 1 } = {}) {
    this.maxConcurrentTasks = maxConcurrentTasks;
    this.taskDescription = null; // remembered from generateDataset(), used by the grader for context
  }

  // -----------------------------------------------------------------
  // Generates a test dataset and writes it to outputFile.
  // promptInputsSpec describes the fields each test case should have,
  // e.g. { question: "A general knowledge question a user might ask" }
  //
  // Every test case ALSO gets two auto-generated fields, tailored to
  // that SPECIFIC scenario (not one generic rubric for the whole
  // dataset):
  //   - "scenario": a short one-sentence label for this test case
  //   - "solutionCriteria": a bullet-point checklist of SPECIFIC,
  //     checkable requirements a good answer to THIS scenario must
  //     meet (e.g. a "increase Vitamin D" case gets Vitamin-D-specific
  //     criteria, a "increase potassium" case gets potassium-specific
  //     criteria) — much stricter than one global extraCriteria string
  //     applied identically to every case.
  // -----------------------------------------------------------------
  async generateDataset({ taskDescription, promptInputsSpec = {}, outputFile = 'dataset.json', numCases = 3 }) {
    this.taskDescription = taskDescription;

    const fieldsList =
      Object.entries(promptInputsSpec)
        .map(([key, desc]) => `- "${key}": ${desc}`)
        .join('\n') || '(no specific fields given — pick whatever inputs make sense for the task)';

    const prompt = `Generate an evaluation dataset for testing this prompt.

Task description: ${taskDescription}

Each test case must be a JSON object with these fields:
- "scenario": a short one-sentence description of this specific test scenario
${fieldsList}
- "solutionCriteria": a checklist (single string, one requirement per line, each line starting with "- ") of SPECIFIC, checkable requirements a good solution to THIS exact scenario must satisfy. Make these concrete (e.g. numeric ranges, specific food types, specific structure) and tailored to this scenario's particular details — not generic.

Vary the scenarios meaningfully (different goals, different constraints) so the dataset covers a diverse range of cases.

Return ONLY a raw JSON array of ${numCases} such objects. No markdown code fences, no extra text before or after.`;

    // Fast models occasionally produce malformed JSON (e.g. a missing
    // closing brace). Rather than crash the whole pipeline on a flaky
    // generation, just ask again a few times before giving up.
    const maxAttempts = 3;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const raw = await chat([{ role: 'user', content: prompt }]);
      const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      try {
        const dataset = JSON.parse(cleaned);
        fs.writeFileSync(outputFile, JSON.stringify(dataset, null, 2));
        console.log(`Generated ${dataset.length} test case(s) -> ${outputFile}`);
        return dataset;
      } catch (error) {
        lastError = error;
        console.log(`  (dataset generation produced invalid JSON on attempt ${attempt}/${maxAttempts} — retrying)`);
      }
    }
    throw new Error(`Failed to generate valid dataset JSON after ${maxAttempts} attempts: ${lastError.message}`);
  }

  // -----------------------------------------------------------------
  // Model grader — "does the output correctly handle this test case?"
  //
  // Grades against, in order of priority:
  //   1. testCase.solutionCriteria — the PER-CASE checklist generated
  //      by generateDataset(), tailored to this exact scenario.
  //   2. extraCriteria — an optional GLOBAL string applied to every
  //      case in the eval (e.g. "must always include a caloric total"),
  //      useful for requirements that apply across the whole dataset
  //      regardless of scenario specifics.
  // Both can be present at once — they're not mutually exclusive.
  // -----------------------------------------------------------------
  async gradeByModel(testCase, output, extraCriteria) {
    const perCaseCriteria = testCase.solutionCriteria
      ? `\n\nThis specific scenario's solution criteria:\n${testCase.solutionCriteria}`
      : '';
    const globalCriteria = extraCriteria
      ? `\n\nAdditionally, every output should satisfy these criteria:\n${extraCriteria}`
      : '';

    const messages = [
      {
        role: 'user',
        content: `You are grading whether an AI's output correctly handles a given test case.

Task description: ${this.taskDescription ?? '(not provided)'}
Scenario: ${testCase.scenario ?? '(not provided)'}
Test case inputs: ${JSON.stringify(testCase)}
AI output: ${output}${perCaseCriteria}${globalCriteria}

Score how well the output addresses the task, scenario, and criteria above, from 1 to 10 (10 = perfect, 1 = wrong/unhelpful). Be strict — only give a high score if ALL stated criteria are actually met, not just attempted.`,
      },
    ];
    return chatForTool(messages, SUBMIT_GRADE_TOOL); // { score, reasoning }
  }

  async runTestCase(testCase, runPromptFunction, extraCriteria) {
    const output = await runPromptFunction(testCase);
    const modelGrade = await this.gradeByModel(testCase, output, extraCriteria);
    const syntaxScore = gradeSyntax(output, testCase);

    const score = syntaxScore != null ? (modelGrade.score + syntaxScore) / 2 : modelGrade.score;

    return {
      testCase,
      output,
      modelScore: modelGrade.score,
      modelReasoning: modelGrade.reasoning,
      syntaxScore, // null when the test case has no "format" field
      score,
    };
  }

  // -----------------------------------------------------------------
  // Loads a dataset file and runs every test case through
  // runPromptFunction, grading each one. This is the function you call
  // every time you want to score a prompt.
  //
  // extraCriteria: optional GLOBAL string describing must-haves that
  // apply to every case (beyond each case's own solutionCriteria).
  // reportFile: where to write the HTML report (set to null to skip).
  // -----------------------------------------------------------------
  async runEvaluation({ runPromptFunction, datasetFile = 'dataset.json', extraCriteria, reportFile = 'output.html' }) {
    const dataset = JSON.parse(fs.readFileSync(datasetFile, 'utf-8'));
    console.log(`\nRunning evaluation on ${dataset.length} test case(s) (max ${this.maxConcurrentTasks} concurrent)...\n`);

    const results = await runWithConcurrencyLimit(dataset, this.maxConcurrentTasks, (testCase) =>
      this.runTestCase(testCase, runPromptFunction, extraCriteria)
    );

    for (const r of results) {
      const syntaxPart = r.syntaxScore != null ? `, syntax ${r.syntaxScore}/10` : '';
      console.log(`- ${r.testCase.scenario ?? JSON.stringify(r.testCase)}`);
      console.log(`    score ${r.score.toFixed(1)}/10 (model ${r.modelScore}/10${syntaxPart}) — ${r.modelReasoning}`);
    }

    const average = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    console.log(`\nAverage score: ${average.toFixed(2)}`);

    if (reportFile) {
      generateHtmlReport(results, reportFile);
    }

    return results;
  }
}
