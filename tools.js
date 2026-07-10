/**
 * TOOL FUNCTIONS
 * ================
 * A "tool function" is a plain JavaScript function that gets executed
 * automatically when the model decides it needs extra information to
 * help the user. If someone asks "What time is it?", the model can't
 * know that on its own (it has no clock) — so it calls a tool function
 * we provide, gets the real answer back, and uses that in its reply.
 *
 * This file just holds the plain functions themselves — step 1 of 5 in
 * the tool-use flow:
 *   1. Write a tool function            <- this file
 *   2. Write a JSON schema describing it to the model
 *   3. Call the model, passing the schema
 *   4. Run the tool when the model asks for it
 *   5. Send the tool's result back and call the model again
 *
 * BEST PRACTICES (why this file is written the way it is):
 * - Descriptive names — both the function name and its parameters
 *   should make their purpose obvious from the name alone.
 * - Validate inputs — check that required parameters aren't empty or
 *   invalid, and THROW when they are.
 * - Meaningful error messages — the model can see thrown error
 *   messages and may retry the call with corrected arguments. A vague
 *   error ("Invalid input") gives it nothing to correct; a specific
 *   one ("date_format cannot be empty") tells it exactly what to fix.
 */

// JS's built-in Date has no strftime-style formatter like Python's
// datetime.strftime() — this small helper adds just the tokens we
// need (%Y %m %d %H %M %S), so getCurrentDatetime behaves the same
// as the Python version from the lesson.
function formatDate(date, format) {
  const pad = (n) => String(n).padStart(2, '0');
  const tokens = {
    '%Y': date.getFullYear(),
    '%m': pad(date.getMonth() + 1),
    '%d': pad(date.getDate()),
    '%H': pad(date.getHours()),
    '%M': pad(date.getMinutes()),
    '%S': pad(date.getSeconds()),
  };
  return format.replace(/%[YmdHMS]/g, (token) => tokens[token]);
}

/**
 * Returns the current date/time formatted according to dateFormat.
 *
 * @param {string} dateFormat - strftime-style format string, e.g. "%Y-%m-%d %H:%M:%S"
 */
function getCurrentDatetime(dateFormat = '%Y-%m-%d %H:%M:%S') {
  if (!dateFormat) {
    throw new Error('date_format cannot be empty');
  }
  return formatDate(new Date(), dateFormat);
}
console.log(getCurrentDatetime('%Y-%m-%d %H:%M:%S'));

/**
 * STEP 2 — JSON SCHEMA
 * ======================
 * The schema is documentation the model reads — it never sees your
 * actual function body, only this description — so it has to be
 * detailed enough for the model to know WHEN to call the tool and
 * WHAT arguments to pass.
 *
 * Naming convention: functionName -> functionNameSchema, so the schema
 * is easy to find right next to (or paired with) the function it
 * describes.
 *
 * NOTE ON SHAPE: Anthropic's native tool format is flat —
 * { name, description, input_schema }. Groq (and OpenAI-compatible
 * APIs generally) wrap it one level deeper: { type: "function",
 * function: { name, description, parameters } }. Same 3 ideas (name /
 * description / argument schema), different nesting — this is the
 * shape `groq.chat.completions.create({ tools: [...] })` expects.
 */
const getCurrentDatetimeSchema = {
  type: 'function',
  function: {
    name: 'get_current_datetime',
    description:
      "Returns the current date and time, formatted according to the given format string. Use this whenever the user asks what the current date, time, or day is, or when a later calculation needs 'now' as a starting point. Returns a single formatted string, not an object.",
    parameters: {
      type: 'object',
      properties: {
        date_format: {
          type: 'string',
          description:
            "strftime-style format string controlling the output shape. Supported tokens: %Y (4-digit year), %m (2-digit month), %d (2-digit day), %H (2-digit hour, 24h clock), %M (2-digit minute), %S (2-digit second). Example: '%Y-%m-%d %H:%M:%S' -> '2026-07-10 17:24:04', or '%H:%M' -> '17:24'. Defaults to '%Y-%m-%d %H:%M:%S' if omitted.",
        },
      },
      required: [],
    },
  },
};

export { getCurrentDatetime, getCurrentDatetimeSchema };

