/**
 * STRUCTURED DATA DEMO
 * =====================
 *
 * WHAT IS "STRUCTURED DATA"?
 * By default, an LLM replies in free-flowing natural language — great
 * for a chat window, useless if your code needs to DO something with
 * the answer (fill a form, save to a database, render a table).
 * Structured data means asking the model to reply in a predictable,
 * parseable format — almost always JSON — so your code can grab the
 * fields directly instead of regexing a sentence apart.
 *
 * EASY ANALOGY
 * Scenario 1 — "Asking nicely" (prompt-based JSON):
 *   You text a friend: "What's your name, age, and city? Reply as JSON."
 *   Usually they'll reply cleanly: {"name": "Priya", "age": 29, "city": "Pune"}
 *   But sometimes a person (or a model) adds a friendly wrapper:
 *   "Sure! Here's the info: {...} Let me know if you need more!"
 *   That stray text breaks JSON.parse() — the format was REQUESTED,
 *   not guaranteed.
 *
 * Scenario 2 — "Handing them a form" (tool/function calling):
 *   Instead of texting, you hand your friend a printed form with three
 *   blank boxes: Name: ___  Age: ___  City: ___ — nothing else on the
 *   page. There's no room to write a friendly sentence. They HAVE to
 *   fill in exactly those three fields. This is what a tool/function
 *   schema does — it's a CONSTRAINT, not a request, so the model has
 *   no room to wrap the answer in extra text.
 *
 * TWO WAYS TO GET STRUCTURED OUTPUT (both shown below):
 *
 * 1. Prompt-based JSON — just ask clearly in the prompt for JSON in
 *    an exact shape, then JSON.parse() the reply text.
 *    - Simple to set up, but slightly fragile (model may add stray
 *      text before/after the JSON, breaking JSON.parse()).
 *
 * 2. Tool/function calling — define a "tool" whose parameters are the
 *    exact structure you want, and force the model to call it. Models
 *    are trained to fill tool/function arguments with clean,
 *    schema-conforming JSON, so this is far more reliable.
 *    - Groq (OpenAI-compatible) calls this "function calling":
 *        tools: [{ type: 'function', function: { name, description, parameters } }]
 *        tool_choice: { type: 'function', function: { name: '...' } }  // forces it
 *    - The Anthropic SDK calls the equivalent "tool use" with a
 *      slightly different shape (name/description/input_schema at the
 *      top level instead of nested under `function`), but the IDEA is
 *      identical: give the model a rigid form to fill out.
 *    - GOTCHA: Groq/OpenAI-style APIs return the filled-in fields as a
 *      JSON STRING in `tool_calls[0].function.arguments` — you still
 *      need one JSON.parse() call (just on the small arguments string,
 *      not the whole free-text reply). Anthropic's SDK, by contrast,
 *      hands back an already-parsed object in `tool_use.input`.
 *
 * WHEN TO USE WHICH
 *   Quick prototype, low stakes           -> prompt-based JSON
 *   Production code feeding a UI/database -> tool/function calling
 *
 * Structured data extraction is really just tool/function calling
 * aimed at yourself instead of an external system (a weather API, a
 * database lookup, etc.) — same mechanism, different purpose.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const SENTENCE = 'Priya is a 29-year-old designer living in Pune.';

// ---------------------------------------------------------------------
// 1. Prompt-based JSON — "asking nicely"
// ---------------------------------------------------------------------
async function extractWithPrompt() {
  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `Extract the name, age, and city from this sentence:
"${SENTENCE}"

Respond with ONLY valid JSON in this exact shape, no other text:
{"name": string, "age": number, "city": string}`,
      },
    ],
  });

  const raw = response.choices[0].message.content;
  const data = JSON.parse(raw); // fragile: breaks if the model adds any stray text
  console.log('Prompt-based JSON:', data);
}

// ---------------------------------------------------------------------
// 2. Function calling — "handing them a form" (more reliable)
// ---------------------------------------------------------------------
async function extractWithFunctionCalling() {
  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 300,
    tools: [
      {
        type: 'function',
        function: {
          name: 'extract_person',
          description: 'Extract structured person details from text.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
              city: { type: 'string' },
            },
            required: ['name', 'age', 'city'],
          },
        },
      },
    ],
    // Forces the model to call this exact function instead of just chatting back
    tool_choice: { type: 'function', function: { name: 'extract_person' } },
    messages: [{ role: 'user', content: SENTENCE }],
  });

  const toolCall = response.choices[0].message.tool_calls[0];
  const data = JSON.parse(toolCall.function.arguments); // arguments arrive as a JSON string
  console.log('Function-calling JSON:', data);
}

async function main() {
  await extractWithPrompt();
  await extractWithFunctionCalling();
}

main();
