/**
 * PROMPT LAB — the workbench
 * ============================
 *
 * THE ITERATIVE IMPROVEMENT PROCESS
 * Prompt engineering isn't "write the perfect prompt on the first try"
 * — it's a repeatable cycle:
 *   1. Set a goal        — what should the prompt accomplish?
 *   2. Write an initial prompt — a basic, even deliberately naive, first try
 *   3. Evaluate it        — run it through the eval pipeline, get a score
 *   4. Apply a technique  — improve ONE thing (be specific, add examples,
 *                           add structure, etc.)
 *   5. Re-evaluate         — confirm the score actually went up
 * Repeat steps 4-5 until you're happy. A low first score (2-3/10) is
 * NORMAL and expected — it's just your baseline to measure improvement
 * against, not a verdict on you.
 *
 * CURRENT GOAL (step 1)
 * Generate a compact, one-day meal plan for an athlete, given their
 * height, weight, goal, and dietary restrictions.
 *
 * THE LOOP:
 *   1. Run this file:            node prompt-lab.js
 *   2. Read the score + reasoning printed for each test case
 *   3. Edit the prompt string inside runPrompt() below
 *   4. Run again, compare the new average score to the last one
 *   5. Repeat
 *
 * The dataset generation step only needs to run ONCE per task you're
 * testing (it's commented out below after the first run — see notes).
 */

import { PromptEvaluator, addUserMessage, chat } from './prompt-evaluator.js';

// Low concurrency to stay under Groq's free-tier rate limit — raise
// this only if you have quota to spare.
const evaluator = new PromptEvaluator({ maxConcurrentTasks: 2 });

// ---------------------------------------------------------------------
// Step 1: Generate the dataset (run once per task, then comment out —
// re-running regenerates dataset.json with a NEW random set of test
// cases, so keep it stable while you iterate on a prompt).
// ---------------------------------------------------------------------
await evaluator.generateDataset({
  taskDescription: 'Write a compact, concise 1 day meal plan for a single athlete',
  promptInputsSpec: {
    height: "Athlete's height in cm",
    weight: "Athlete's weight in kg",
    goal: 'Goal of the athlete',
    restrictions: 'Dietary restrictions of the athlete',
  },
  outputFile: 'dataset.json',
  numCases: 3,
});

// ---------------------------------------------------------------------
// Step 2: Define the prompt you want to test.
//
// BASELINE (v1) — deliberately naive. This establishes where we're
// starting from. Expect a low score here (a 2-3/10 is typical for a
// first attempt) — that's the point of a baseline, not a failure.
// <-- EDIT THIS, then re-run `node prompt-lab.js` to see the new score.
// ---------------------------------------------------------------------
async function runPrompt(testCase) {
  const prompt = `
What should this person eat?

- Height: ${testCase.height}
- Weight: ${testCase.weight}
- Goal: ${testCase.goal}
- Dietary restrictions: ${testCase.restrictions}
`;

  const messages = [];
  addUserMessage(messages, prompt);
  return chat(messages);
}

// ---------------------------------------------------------------------
// Step 3: Run the evaluation and see the score.
//
// extraCriteria tells the grader exactly what "good" looks like for
// this task, beyond the vague task description — without this, a
// wishy-washy answer could still score deceptively well.
// ---------------------------------------------------------------------
await evaluator.runEvaluation({
  runPromptFunction: runPrompt,
  datasetFile: 'dataset.json',
  extraCriteria: `
The output should include:
- Daily caloric total
- Macronutrient breakdown
- Meals with exact foods, portions, and timing
`,
});
