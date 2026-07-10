/**
 * TECHNIQUE #1 — BE CLEAR AND DIRECT
 * =====================================
 * The first line of a prompt matters most: use simple language, say
 * exactly what you want, and lead with an action verb ("Write,"
 * "Generate") instead of a question.
 *
 *   v1 (vague question):  "What should this person eat?"
 *   v2 (clear + direct):  "Generate a one-day meal plan for an athlete
 *                          that meets their dietary restrictions."
 *
 * Both versions run against the SAME 8-question dataset (generated
 * once below), so the comparison is fair. 8 cases instead of 3 also
 * makes the average less noisy — one lucky/unlucky case can't swing
 * the whole score as much.
 */

import { PromptEvaluator, addUserMessage, chat } from './prompt-evaluator.js';

const DATASET_FILE = 'meal-plan-dataset.json';
const evaluator = new PromptEvaluator({ maxConcurrentTasks: 1 });

// Generated once — commented out so v1 and v2 keep being tested
// against the exact same questions (already generated: meal-plan-dataset.json).
// await evaluator.generateDataset({
//   taskDescription: 'Write a compact, concise 1 day meal plan for a single athlete',
//   promptInputsSpec: {
//     height: "Athlete's height in cm",
//     weight: "Athlete's weight in kg",
//     goal: 'Goal of the athlete',
//     restrictions: 'Dietary restrictions of the athlete',
//   },
//   outputFile: DATASET_FILE,
//   numCases: 8,
// });

const EXTRA_CRITERIA = `
The output should include:
- Daily caloric total
- Macronutrient breakdown
- Meals with exact foods, portions, and timing
`;

// v1 — baseline, vague question
async function runPromptV1(testCase) {
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

// v2 — clear and direct instruction
async function runPromptV2(testCase) {
  const prompt = `
Generate a one-day meal plan for an athlete that meets their dietary restrictions.

- Height: ${testCase.height}
- Weight: ${testCase.weight}
- Goal: ${testCase.goal}
- Dietary restrictions: ${testCase.restrictions}
`;
  const messages = [];
  addUserMessage(messages, prompt);
  return chat(messages);
}

function average(results) {
  return results.reduce((sum, r) => sum + r.score, 0) / results.length;
}

async function main() {
  console.log('\n=== v1: vague question ===');
  const v1 = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptV1,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-v1.html',
    })
  );

  console.log('\n=== v2: clear and direct ===');
  const v2 = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptV2,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-v2.html',
    })
  );

  console.log('\n=== Comparison ===');
  console.log(`v1 (vague question):  ${v1.toFixed(2)}`);
  console.log(`v2 (clear & direct):  ${v2.toFixed(2)}`);
  console.log(
    v2 > v1
      ? `v2 wins by ${(v2 - v1).toFixed(2)}`
      : v2 < v1
        ? `v1 wins by ${(v1 - v2).toFixed(2)}`
        : 'Tie'
  );
}

main();
