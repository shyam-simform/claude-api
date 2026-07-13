/**
 * STREAMING + TOOL USE ("fine-grained tool calling")
 * =====================================================
 * Anthropic's Claude API, when streaming a tool call, buffers and
 * validates JSON before handing it to you — it waits for a complete,
 * schema-valid top-level key before sending anything, which is why you
 * see a pause, then a burst of text. "Fine-grained tool calling" is an
 * opt-in flag that turns OFF that buffering: you get raw JSON
 * fragments the instant the model generates them, faster but
 * unvalidated — your code has to expect partial/invalid JSON mid-stream.
 *
 * Groq/OpenAI-style APIs have no such flag, because they have no
 * buffered "safe" mode to disable in the first place — tool_calls
 * deltas are just sent as-is, whatever shape the model produces them
 * in. Below we accumulate them defensively (handling the case where a
 * model DOES split arguments across chunks), then show what Groq's
 * llama-3.1-8b-instant actually does: it typically emits the entire
 * arguments string in a single delta, even under stream: true — the
 * "mid-stream invalid JSON" problem the lesson describes doesn't really
 * show up here, unlike with genuine token-by-token streaming.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import { setReminderSchema } from './tools.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

async function streamToolCall(userMessage) {
  const stream = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: userMessage }],
    tools: [setReminderSchema],
    stream: true,
    temperature: 0.3,
  });

  // One entry per tool call, keyed by its index — a model could
  // request more than one tool call in the same response.
  const calls = {};

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta?.tool_calls) continue;

    for (const toolCallDelta of delta.tool_calls) {
      const entry = (calls[toolCallDelta.index] ??= { id: '', name: '', argsSnapshot: '' });
      if (toolCallDelta.id) entry.id = toolCallDelta.id;
      if (toolCallDelta.function?.name) entry.name += toolCallDelta.function.name;

      const fragment = toolCallDelta.function?.arguments;
      if (!fragment) continue;

      // "partial_json" from the lesson — the new fragment this event added
      console.log('  fragment received:', fragment);
      entry.argsSnapshot += fragment;

      // "snapshot" from the lesson — everything accumulated so far.
      // Like fine-grained tool calling, this may not be valid JSON yet.
      try {
        const parsed = JSON.parse(entry.argsSnapshot);
        console.log('  snapshot is valid JSON so far:', parsed);
      } catch {
        console.log('  snapshot not valid JSON yet (normal mid-stream) ->', entry.argsSnapshot);
      }
    }
  }

  return Object.values(calls);
}

async function main() {
  const calls = await streamToolCall(
    "Set a reminder for a doctor's appointment on 2050-06-27T00:00:00."
  );

  console.log('\nFinal parsed tool call(s):');
  for (const call of calls) {
    console.log(`  ${call.name} ->`, JSON.parse(call.argsSnapshot));
  }
}

main();
