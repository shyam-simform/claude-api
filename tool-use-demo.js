/**
 * STEP 3 — Call the model with a tool schema, inspect the response.
 *
 * Groq's response has two separate parts (unlike Anthropic's single
 * content-block list): `message.content` (plain text, may be missing)
 * and `message.tool_calls` (array of requested function calls).
 * `tool_calls[i].function.arguments` is a JSON string — parse it.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import { getCurrentDatetimeSchema } from './tools.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

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

async function main() {
  const messages = [];
  addUserMessage(messages, 'What is the exact time, formatted as HH:MM:SS?');

  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1000,
    messages,
    tools: [getCurrentDatetimeSchema],
  });

  const message = response.choices[0].message;

  console.log('content:', message.content);
  console.log('tool_calls:', message.tool_calls);

  if (message.tool_calls) {
    for (const call of message.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      console.log(`\nWants to call ${call.function.name} with`, args);
    }
  }

  addAssistantMessage(messages, message);
}

main();
