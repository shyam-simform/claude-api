/**
 * THE TEXT EDITOR TOOL
 * ======================
 * On Claude, this is special: the JSON schema is BUILT INTO the model —
 * you send a tiny stub like { type: "text_editor_20250124", name:
 * "str_replace_editor" } and Claude expands it into the full spec
 * itself. You still have to write the actual file-handling function,
 * just not its schema.
 *
 * Groq has no such built-in concept — there's no server-side knowledge
 * of a "text editor tool" to expand a stub into. So here we have to
 * write BOTH the full schema (describing all 5 commands ourselves)
 * AND the implementation. Nothing is provided for free.
 *
 * The 5 commands, matching Claude's real text editor tool commands:
 *   view        - read a file (optionally a line range) or list a directory
 *   create      - write a brand new file (or overwrite one)
 *   str_replace - find exact text in a file and replace it
 *   insert      - insert new text after a given line number
 *   undo_edit   - revert a file to its state before the last edit
 */

import 'dotenv/config';
import Groq from 'groq-sdk';
import fs from 'node:fs';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

// Every edit saves the file's PREVIOUS content here first, so
// undo_edit has something to restore. Keyed by path, one slot back.
const editHistory = {};

function view(path, viewRange) {
  if (fs.statSync(path).isDirectory()) {
    return fs.readdirSync(path).join('\n');
  }
  const lines = fs.readFileSync(path, 'utf8').split('\n');
  if (!viewRange) return lines.join('\n');
  const [start, end] = viewRange;
  return lines.slice(start - 1, end === -1 ? undefined : end).join('\n');
}

function create(path, fileText) {
  if (fs.existsSync(path)) {
    editHistory[path] = fs.readFileSync(path, 'utf8');
  }
  fs.writeFileSync(path, fileText);
  return `Created ${path}`;
}

function strReplace(path, oldStr, newStr) {
  const content = fs.readFileSync(path, 'utf8');
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`old_str not found in ${path}`);
  if (count > 1) throw new Error(`old_str is not unique in ${path} (found ${count} times)`);

  editHistory[path] = content;
  fs.writeFileSync(path, content.replace(oldStr, newStr));
  return `Replaced text in ${path}`;
}

function insert(path, insertLine, newStr) {
  const content = fs.readFileSync(path, 'utf8');
  editHistory[path] = content;

  const lines = content.split('\n');
  lines.splice(insertLine, 0, newStr);
  fs.writeFileSync(path, lines.join('\n'));
  return `Inserted text into ${path} after line ${insertLine}`;
}

function undoEdit(path) {
  const previous = editHistory[path];
  if (previous === undefined) throw new Error(`No edit history for ${path}`);
  fs.writeFileSync(path, previous);
  delete editHistory[path];
  return `Reverted ${path} to its previous state`;
}

// Single entry point — dispatches on `command`, the same way Claude's
// real text editor tool works.
function runTextEditorTool(args) {
  switch (args.command) {
    case 'view':
      return view(args.path, args.view_range);
    case 'create':
      return create(args.path, args.file_text);
    case 'str_replace':
      return strReplace(args.path, args.old_str, args.new_str);
    case 'insert':
      return insert(args.path, args.insert_line, args.new_str);
    case 'undo_edit':
      return undoEdit(args.path);
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

const textEditorToolSchema = {
  type: 'function',
  function: {
    name: 'str_replace_editor',
    description:
      'Lets you view, create, and edit files. Pick the right command: "view" to read a file or list a directory, "create" to write a new file (or fully overwrite one), "str_replace" to swap one exact, unique piece of text for another, "insert" to add text after a given line number, "undo_edit" to revert a file to before its last edit.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['view', 'create', 'str_replace', 'insert', 'undo_edit'],
          description: 'Which file operation to perform.',
        },
        path: { type: 'string', description: 'File or directory path to operate on.' },
        view_range: {
          type: 'array',
          items: { type: 'number' },
          description:
            'Optional [start_line, end_line] for "view", 1-indexed. Use -1 as end_line to mean "to the end of the file".',
        },
        file_text: {
          type: 'string',
          description: 'Full contents to write. Required for "create".',
        },
        old_str: {
          type: 'string',
          description:
            'Exact text to find and replace. Required for "str_replace" — must appear exactly once in the file.',
        },
        new_str: {
          type: 'string',
          description:
            'Replacement text for "str_replace", or the text to add for "insert".',
        },
        insert_line: {
          type: 'number',
          description: 'Line number to insert new_str after. Required for "insert".',
        },
      },
      required: ['command', 'path'],
    },
  },
};

async function chat(messages, retries = 5) {
  for (let i = 1; i <= retries; i++) {
    try {
      const response = await groq.chat.completions.create({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.3,
        messages,
        tools: [textEditorToolSchema],
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
  messages.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls });
}

function addToolResult(messages, toolCallId, result) {
  messages.push({ role: 'tool', tool_call_id: toolCallId, content: String(result) });
}

async function runConversation(messages) {
  while (true) {
    const message = await chat(messages);
    addAssistantMessage(messages, message);

    if (!message.tool_calls) return message;

    for (const call of message.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      let result;
      try {
        result = runTextEditorTool(args);
      } catch (error) {
        result = `Error: ${error.message}`;
      }
      console.log(`  Ran ${args.command} on ${args.path} ->`, result.slice(0, 200));
      addToolResult(messages, call.id, result);
    }
  }
}

async function main() {
  const messages = [];
  addUserMessage(
    messages,
    'Open the ./text-editor-sandbox/main.ts file and write out a TypeScript function to calculate pi to the 5th digit. Then create a ./text-editor-sandbox/test.ts file with a small test for it (plain assertions, no test framework needed).'
  );

  const finalMessage = await runConversation(messages);
  console.log('\nFinal answer:', finalMessage.content);
}

main();
