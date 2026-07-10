/**
 * TECHNIQUE #2 — SPECIFY THE OUTPUT FORMAT
 * ===========================================
 * Being "clear and direct" (technique #1) fixes vague, non-committal
 * answers — but it doesn't tell the model WHAT STRUCTURE the answer
 * needs. If the grading criteria require a caloric total, a
 * macronutrient breakdown, and exact portions, but the prompt itself
 * never mentions those things, the model has no way to know it's
 * being judged on them.
 *
 *   baseline (technique #1's winner): "Generate a one-day meal plan
 *     for an athlete that meets their dietary restrictions."
 *
 *   v3 (format specified): same instruction, PLUS an explicit list of
 *     what the output must include.
 *
 * Same frozen 8-question dataset as technique-1, so this is a fair
 * continuation of that comparison.
 */

import { PromptEvaluator, addUserMessage, chat } from './prompt-evaluator.js';

const DATASET_FILE = 'meal-plan-dataset.json'; // reusing the same frozen dataset — do NOT regenerate
const evaluator = new PromptEvaluator({ maxConcurrentTasks: 1 });

const EXTRA_CRITERIA = `
The output should include:
- Daily caloric total
- Macronutrient breakdown
- Meals with exact foods, portions, and timing
`;

// baseline — clear and direct, but silent on structure (technique #1's version)
async function runPromptBaseline(testCase) {
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

// v3 — same instruction, now explicitly telling the model what to include
async function runPromptSpecifyFormat(testCase) {
  const prompt = `
Generate a one-day meal plan for an athlete that meets their dietary restrictions.

Include:
- The total daily caloric intake
- A macronutrient breakdown (protein, carbs, fat)
- Each meal with exact foods, portions, and timing

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
  console.log('\n=== baseline: clear + direct, no format spec ===');
  const baseline = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptBaseline,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-baseline.html',
    })
  );

  console.log('\n=== v3: format explicitly specified ===');
  const v3 = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptSpecifyFormat,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-v3.html',
    })
  );

  console.log('\n=== Comparison ===');
  console.log(`baseline (no format spec):   ${baseline.toFixed(2)}`);
  console.log(`v3 (format specified):       ${v3.toFixed(2)}`);
  console.log(
    v3 > baseline
      ? `v3 wins by ${(v3 - baseline).toFixed(2)}`
      : v3 < baseline
        ? `baseline wins by ${(baseline - v3).toFixed(2)}`
        : 'Tie'
  );
}

main();
