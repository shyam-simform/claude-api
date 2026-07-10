/**
 * TECHNIQUE #4 — STRUCTURE WITH XML TAGS
 * =========================================
 * When a prompt mixes instructions with data (especially a lot of it,
 * or several different kinds), the model can struggle to tell which
 * text is "content to analyze" vs. "instructions to follow." Wrapping
 * data in descriptive XML tags (<sales_records>, <athlete_information>,
 * <my_code>) creates clear boundaries.
 *
 * IMPORTANT CAVEAT FROM THE LESSON: this technique's own expected
 * impact is small for SIMPLE prompts like ours — it matters most with
 * large amounts of context or mixed content types (code + docs, pages
 * of records). Our meal-plan prompt is just 4 short fields, so this is
 * a good test of the lesson's own prediction: expect little to no
 * measurable difference here, unlike techniques #1-3 which claimed
 * large effects.
 *
 *   baseline: plain bullet list (no tags)
 *   v5:       same fields wrapped in <athlete_information> tags
 *
 * Same frozen 8-question dataset as previous techniques.
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

// baseline — clear and direct, plain bullet list (no XML tags)
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

// v5 — same fields, wrapped in a descriptive XML tag
async function runPromptXmlStructure(testCase) {
  const prompt = `
<athlete_information>
- Height: ${testCase.height}
- Weight: ${testCase.weight}
- Goal: ${testCase.goal}
- Dietary restrictions: ${testCase.restrictions}
</athlete_information>

Generate a one-day meal plan based on the athlete information above that meets their dietary restrictions.
`;
  const messages = [];
  addUserMessage(messages, prompt);
  return chat(messages);
}

function average(results) {
  return results.reduce((sum, r) => sum + r.score, 0) / results.length;
}

async function main() {
  console.log('\n=== baseline: plain bullet list (no XML tags) ===');
  const baseline = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptBaseline,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-baseline-v5.html',
    })
  );

  console.log('\n=== v5: XML-structured athlete info ===');
  const v5 = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptXmlStructure,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-v5.html',
    })
  );

  console.log('\n=== Comparison ===');
  console.log(`baseline (bullet list):     ${baseline.toFixed(2)}`);
  console.log(`v5 (XML tags):              ${v5.toFixed(2)}`);
  console.log(
    v5 > baseline
      ? `v5 wins by ${(v5 - baseline).toFixed(2)}`
      : v5 < baseline
        ? `baseline wins by ${(baseline - v5).toFixed(2)}`
        : 'Tie'
  );
}

main();
