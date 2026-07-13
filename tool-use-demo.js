/**
 * STEP 3-5 — Call the model, run the requested tool, send result back.
 *
 * Groq's response has two separate parts (unlike Anthropic's single
 * content-block list): `message.content` (plain text, may be missing)
 * and `message.tool_calls` (array of requested function calls).
 * `tool_calls[i].function.arguments` is a JSON string — parse it.
 *
 * Sending the result back also differs from Anthropic: it's its own
 * message with role: 'tool' and a tool_call_id (not a tool_result
 * block inside a user message). No is_error field — put error text
 * straight in content if something failed.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import { getCurrentDatetime, getCurrentDatetimeSchema } from './tools.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

// The model occasionally garbles a tool call's JSON (tool_use_failed) —
// just retry a couple of times instead of crashing.
async function createChatCompletion(params, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await groq.chat.completions.create(params);
    } catch (error) {
      if (error?.error?.error?.code !== 'tool_use_failed' || i === retries) throw error;
      console.log(`  (invalid tool call — retrying, attempt ${i}/${retries})`);
    }
  }
}

function addUserMessage(messages, text) {
  messages.push({ role: 'user', content: text });
}

// Must keep both content AND tool_calls when saving an assistant
// message to history, or the model forgets its own tool call.
function addAssistantMessage(messages, message) {
  messages.push({
    role: 'assistant',
    content: message.content,
    tool_calls: message.tool_calls,
  });
}

function addToolResult(messages, toolCallId, result) {
  messages.push({
    role: 'tool',
    tool_call_id: toolCallId,
    content: String(result),
  });
}

async function main() {
  const messages = [];
  addUserMessage(messages, 'What is the exact time, formatted as HH:MM:SS?');

  const response = await createChatCompletion({
    model: MODEL,
    max_tokens: 1000,
    messages,
    tools: [getCurrentDatetimeSchema],
  });

  const message = response.choices[0].message;
  addAssistantMessage(messages, message);

  if (!message.tool_calls) {
    console.log('No tool call:', message.content);
    return;
  }

  // Run each requested tool call, send the results back
  for (const call of message.tool_calls) {
    const args = JSON.parse(call.function.arguments);
    let result;
    try {
      result = getCurrentDatetime(args.date_format);
    } catch (error) {
      result = `Error: ${error.message}`;
    }
    console.log(`Ran ${call.function.name} ->`, result);
    addToolResult(messages, call.id, result);
  }

  // Still include the schema — the model needs it to understand the
  // tool_calls already in the conversation history.
  const followup = await createChatCompletion({
    model: MODEL,
    max_tokens: 1000,
    messages,
    tools: [getCurrentDatetimeSchema],
  });

  const followupMessage = followup.choices[0].message;
  console.log('\nFinal message (full):', followupMessage);
  console.log('Final response:', followupMessage.content);
}

main();

// The full loop is working — all 5 steps completed:

// Tool function (getCurrentDatetime) — written earlier
// JSON Schema — written earlier
// Called the model — it requested get_current_datetime
// Ran the tool — Ran get_current_datetime -> 19:16:19
// Sent the result back, got a final response — the model incorporated it into a natural reply