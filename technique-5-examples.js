/**
 * TECHNIQUE #5 — PROVIDE EXAMPLES (one-shot / multi-shot)
 * ==========================================================
 * Examples show rather than tell. Instead of describing what a good
 * meal plan looks like in the abstract, we give the model a REAL
 * input/output pair that already scored a perfect 10/10 in our own
 * evals, wrapped in <sample_input> / <ideal_output> tags, plus a short
 * note on WHY it's good — not just the example itself.
 *
 * The example below (vegetarian endurance runner) was pulled directly
 * from technique-1's results (output-v2.html) — a real 10/10 case, not
 * invented. This is exactly what the lesson recommends: mine your own
 * eval results for genuine high scorers instead of writing examples
 * from scratch.
 *
 *   baseline: XML-structured prompt, no example (technique #4's v5)
 *   v6:       same, PLUS a one-shot ideal example
 *
 * ALSO FIXING THE NOISE PROBLEM: every technique so far (#1-#4) was
 * tested at temperature=1.0, and we proved the score for an UNCHANGED
 * prompt can swing 2+ points run to run purely from randomness — bigger
 * than any effect we measured. This file drops temperature to 0.3 for
 * both versions, so the comparison actually reflects the prompt
 * difference rather than sampling luck.
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

// A real 10/10 result from technique-1's eval run (output-v2.html) —
// the "endurance runner, vegetarian" case. Used verbatim as the example.
const IDEAL_EXAMPLE_INPUT = `Height: 165
Weight: 55
Goal: Maintain weight for optimal running performance
Restrictions: Vegetarian`;

const IDEAL_EXAMPLE_OUTPUT = `Given the athlete's height, weight, and goal of maintaining weight for optimal running performance, and their dietary restrictions as a vegetarian, I've created a one-day meal plan that provides approximately 1800-2000 calories, with a balanced mix of carbohydrates, protein, and healthy fats.

**Breakfast**
- Whole grain cereal with nuts and seeds (300 calories, 30g carbs, 10g protein, 15g fat)
- 1 cup low-fat plant-based milk (200 calories, 20g carbs, 5g protein, 10g fat)

**Mid-morning Snack**
- Energy bar + apple slices (245 calories, 50g carbs, 10g protein, 5.5g fat)

**Lunch**
- Whole grain pasta with marinara sauce and roasted vegetables (400 calories, 60g carbs, 15g protein, 10g fat)
- Mixed greens salad with cherry tomatoes and cucumber (100 calories, 20g carbs, 5g protein, 10g fat)

**Mid-afternoon Snack**
- Greek yogurt with honey and berries (150 calories, 30g carbs, 10g protein, 5g fat)

**Pre-Run Snack**
- Banana with peanut butter (150 calories, 30g carbs, 8g protein, 8g fat)

**Post-Run Snack (within 30 minutes after running)**
- Recovery smoothie: plant-based protein powder, plant milk, almond butter, banana, spinach (250 calories, 40g carbs, 20g protein, 10g fat)

**Dinner**
- Whole grain quinoa with roasted vegetables and tahini sauce (500 calories, 60g carbs, 10g protein, 20g fat)

**Total Daily Intake**
- Calories: 1885
- Carbohydrates: 320g
- Protein: 90g
- Fat: 110g`;

const EXAMPLE_EXPLANATION = `This example is well-structured, breaks down calories and macros per meal AND as a daily total, uses only vegetarian foods, includes exact portions, and aligns with the athlete's goal of maintaining weight.`;

// baseline — XML-structured, no example (technique #4's winner), lower temperature
async function runPromptBaseline(testCase) {
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
  return chat(messages, { temperature: 0.3 });
}

// v6 — same prompt, plus a one-shot ideal example mined from our own evals
async function runPromptWithExample(testCase) {
  const prompt = `
Here is an example input with an ideal response:

<sample_input>
${IDEAL_EXAMPLE_INPUT}
</sample_input>

<ideal_output>
${IDEAL_EXAMPLE_OUTPUT}
</ideal_output>

${EXAMPLE_EXPLANATION}

Now generate a one-day meal plan for the following athlete, in the same style as the example above:

<athlete_information>
- Height: ${testCase.height}
- Weight: ${testCase.weight}
- Goal: ${testCase.goal}
- Dietary restrictions: ${testCase.restrictions}
</athlete_information>
`;
  const messages = [];
  addUserMessage(messages, prompt);
  return chat(messages, { temperature: 0.3 });
}

function average(results) {
  return results.reduce((sum, r) => sum + r.score, 0) / results.length;
}

async function main() {
  console.log('\n=== baseline: XML structure, no example (temp 0.3) ===');
  const baseline = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptBaseline,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-baseline-v6.html',
    })
  );

  console.log('\n=== v6: one-shot example added (temp 0.3) ===');
  const v6 = average(
    await evaluator.runEvaluation({
      runPromptFunction: runPromptWithExample,
      datasetFile: DATASET_FILE,
      extraCriteria: EXTRA_CRITERIA,
      reportFile: 'output-v6.html',
    })
  );

  console.log('\n=== Comparison (temperature 0.3 — lower noise than #1-#4) ===');
  console.log(`baseline (no example):  ${baseline.toFixed(2)}`);
  console.log(`v6 (with example):      ${v6.toFixed(2)}`);
  console.log(
    v6 > baseline
      ? `v6 wins by ${(v6 - baseline).toFixed(2)}`
      : v6 < baseline
        ? `baseline wins by ${(baseline - v6).toFixed(2)}`
        : 'Tie'
  );
}

main();
