/**
 * TECHNIQUE #3 — BE SPECIFIC (output quality guidelines)
 * =========================================================
 * "Clear and direct" (technique #1) tells the model WHAT to do.
 * "Be specific" goes further: it tells the model exactly what
 * ELEMENTS the output must contain — length, structure, required
 * attributes, tone. Without this, the model decides those details
 * itself, which is why our earlier runs kept missing calorie targets,
 * exact portions, and macronutrient breakdowns: nothing in the prompt
 * ever asked for them.
 *
 *   baseline: clear + direct instruction only (technique #1's winner)
 *   v4:       same instruction + an explicit numbered guideline list
 *
 * Same frozen 8-question dataset as technique-1/2, for a fair
 * comparison.
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

// baseline — clear and direct, no explicit guidelines
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

// v4 — same instruction, plus an explicit output-quality guideline list
async function runPromptBeSpecific(testCase) {
  const prompt = `
Generate a one-day meal plan for an athlete that meets their dietary restrictions.

Guidelines:
1. Include accurate daily calorie amount
2. Show protein, fat, and carb amounts
3. Specify when to eat each meal
4. Use only foods that fit restrictions
5. List all portion sizes in grams
6. Keep budget-friendly if mentioned

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
  console.log('\n=== baseline: clear + direct, no guidelines ===');
  const baseline = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptBaseline,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-baseline-v4.html',
    })
  );

  console.log('\n=== v4: be specific (explicit guidelines) ===');
  const v4 = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptBeSpecific,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-v4.html',
    })
  );

  console.log('\n=== Comparison ===');
  console.log(`baseline (no guidelines):  ${baseline.toFixed(2)}`);
  console.log(`v4 (be specific):          ${v4.toFixed(2)}`);
  console.log(
    v4 > baseline
      ? `v4 wins by ${(v4 - baseline).toFixed(2)}`
      : v4 < baseline
        ? `baseline wins by ${(baseline - v4).toFixed(2)}`
        : 'Tie'
  );
}

main();
