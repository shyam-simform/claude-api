/**
 * MULTI-TURN TOOL USE
 * =====================
 * Some questions need more than one tool call to answer. E.g. "what day
 * is 103 days from today?" needs get_current_datetime FIRST (to know
 * "today"), then add_duration_to_datetime with that result. The model
 * can't do both in one shot — it has to see the first tool's result
 * before it knows to ask for the second one.
 *
 * So instead of "call model once, run one tool, call model once more",
 * we loop: keep calling the model and running whatever tools it asks
 * for, until it replies with a plain answer instead of a tool call.
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import {
  getCurrentDatetime,
  getCurrentDatetimeSchema,
  addDurationToDatetime,
  addDurationToDatetimeSchema,
  setReminder,
  setReminderSchema,
} from './tools.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

const TOOLS = [getCurrentDatetimeSchema, addDurationToDatetimeSchema, setReminderSchema];

// Maps a schema's function name -> the real function that runs it.
const TOOL_FUNCTIONS = {
  get_current_datetime: (args) => getCurrentDatetime(args.date_format),
  add_duration_to_datetime: (args) =>
    addDurationToDatetime(args.datetime_str, args.amount, args.unit, args.date_format),
  set_reminder: (args) => setReminder(args.content, args.timestamp),
};

// The 8B model sometimes tries to answer in one tool call by nesting a
// call to another tool as an argument value (invalid JSON) instead of
// calling tools one at a time. Spelling out the order up front fixes it.
const SYSTEM_MESSAGE = {
  role: 'system',
  content:
    'You have tools that must be called one at a time, in sequence. If a question needs "now" as a starting point, first call get_current_datetime and wait for its result — do NOT guess the date or call another tool as an argument. Only after you have that result should you call add_duration_to_datetime, using the exact string get_current_datetime returned as datetime_str. Once you have the final tool result, state the answer directly (e.g. the actual date or time) instead of just saying a function was called.',
};

async function chat(messages, retries = 5) {
  for (let i = 1; i <= retries; i++) {
    try {
      const response = await groq.chat.completions.create({
        model: MODEL,
        max_tokens: 1000,
        temperature: 0.3,
        messages: [SYSTEM_MESSAGE, ...messages],
        tools: TOOLS,
      });
      return response.choices[0].message;
    } catch (error) {
      if (error?.error?.error?.code !== 'tool_use_failed' || i === retries) throw error;
      console.log(`  (invalid tool call — retrying, attempt ${i}/${retries})`);
    }
  }
}

function addUserMessage(messages, text) {
  messages.push({ role: 'user', content: text });
}

function addAssistantMessage(messages, message) {
  messages.push({
    role: 'assistant',
    content: message.content,
    tool_calls: message.tool_calls,
  });
}

function addToolResult(messages, toolCallId, result) {
  messages.push({ role: 'tool', tool_call_id: toolCallId, content: String(result) });
}

// Runs every tool call the model asked for and records each result.
function runTools(message, messages) {
  for (const call of message.tool_calls) {
    const args = JSON.parse(call.function.arguments);
    const fn = TOOL_FUNCTIONS[call.function.name];
    let result;
    try {
      result = fn(args);
    } catch (error) {
      result = `Error: ${error.message}`;
    }
    console.log(`  Ran ${call.function.name}(${JSON.stringify(args)}) -> ${result}`);
    addToolResult(messages, call.id, result);
  }
}

// The loop: keep calling the model + running tools until it stops
// asking for tools and just answers instead.
async function runConversation(messages) {
  while (true) {
    const message = await chat(messages);
    addAssistantMessage(messages, message);

    if (!message.tool_calls) {
      return message;
    }

    runTools(message, messages);
  }
}

async function main() {
  const messages = [];
  addUserMessage(
    messages,
    "Set a reminder for my doctor's appointment. It's 177 days after Jan 1st, 2027."
  );

  const finalMessage = await runConversation(messages);

  console.log('\nFinal answer:', finalMessage.content);
}

main();
