/**
 * EXTENDED THINKING (Claude) vs. REASONING (Groq)
 * ===================================================
 * Claude's extended thinking gives the model "scratch paper" — space to
 * reason before answering — and returns it as a separate thinking block
 * alongside the final answer, so you can see (and show users) HOW it
 * got there, not just the result.
 *
 * Groq has its own version of this for models that support it (not
 * llama-3.1-8b-instant — we're switching to qwen/qwen3-32b here, one of
 * the reasoning-capable models Groq hosts). The concept maps over
 * cleanly, but the knobs are named differently:
 *
 *   Claude                          Groq
 *   -------------------------------  -------------------------------
 *   thinking: {type:"enabled",       reasoning_effort: "low" |
 *     budget: 1024+}                   "medium" | "high" | "none"
 *   (a TOKEN BUDGET you pick)        (an EFFORT LEVEL, model picks
 *                                     how many tokens that takes)
 *   response.content has a           response.choices[0].message
 *     "thinking" block + "text"        .reasoning (separate field)
 *     block                            + .content (the final answer)
 *   Cryptographic signature on       No equivalent — Groq has no
 *     thinking, to detect tampering    tamper-detection on reasoning
 *   redacted_thinking blocks         No equivalent — this is an
 *     (safety-flagged, encrypted)      Anthropic-specific safety
 *                                      mechanism
 *
 * reasoning_format controls how the reasoning comes back:
 *   "parsed" -> separate `reasoning` field (what we use below)
 *   "raw"    -> reasoning stays inline in `content`, wrapped in tags
 *   "hidden" -> reasoning is used internally but not returned at all
 */

import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const REASONING_MODEL = 'qwen/qwen3-32b';

async function chat(userMessage, { reasoningEffort = 'none' } = {}) {
  const response = await groq.chat.completions.create({
    model: REASONING_MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: userMessage }],
    reasoning_format: 'parsed',
    reasoning_effort: reasoningEffort,
  });
  return response.choices[0].message;
}

async function main() {
  const question = "A farmer has 17 sheep, all but 9 die. How many are left?";

  console.log('=== Without reasoning (reasoning_effort: "none") ===');
  const plain = await chat(question, { reasoningEffort: 'none' });
  console.log('content:', plain.content);
  console.log('reasoning:', plain.reasoning ?? '(none — matches Claude with thinking disabled)');

  console.log('\n=== With reasoning (reasoning_effort: "default") ===');
  const reasoned = await chat(question, { reasoningEffort: 'default' });
  console.log('reasoning (the "scratch paper"):\n', reasoned.reasoning.slice(0, 500), '...\n');
  console.log('content (the final answer):\n', reasoned.content);
}

main();
