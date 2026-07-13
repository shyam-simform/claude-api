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

// Inverse of formatDate — parses a string produced with a given
// strftime-style format back into a JS Date. Needed so
// addDurationToDatetime can read the same format getCurrentDatetime
// writes, keeping the two tools chainable.
function parseDate(dateString, format) {
  const tokenPattern = {
    '%Y': '(\\d{4})',
    '%m': '(\\d{2})',
    '%d': '(\\d{2})',
    '%H': '(\\d{2})',
    '%M': '(\\d{2})',
    '%S': '(\\d{2})',
  };
  const order = [];
  const regexStr = format.replace(/%[YmdHMS]/g, (token) => {
    order.push(token);
    return tokenPattern[token];
  });

  const match = new RegExp(`^${regexStr}$`).exec(dateString);
  if (!match) {
    throw new Error(`datetime_str "${dateString}" does not match format "${format}"`);
  }

  const now = new Date();
  const parts = { Y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(), H: 0, M: 0, S: 0 };
  order.forEach((token, i) => {
    parts[token[1]] = parseInt(match[i + 1], 10);
  });
  return new Date(parts.Y, parts.m - 1, parts.d, parts.H, parts.M, parts.S);
}

const MS_PER_UNIT = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Adds (or subtracts, with a negative amount) a duration to a given
 * date/time. LLMs are unreliable at date arithmetic — this tool lets
 * the model offload that math to real code instead of computing it.
 *
 * @param {string} datetimeStr - starting date/time, formatted per dateFormat
 * @param {number} amount - how much to add; negative to subtract
 * @param {string} unit - one of: seconds, minutes, hours, days, weeks
 * @param {string} dateFormat - strftime-style format used for both parsing datetimeStr and formatting the result
 */
function addDurationToDatetime(datetimeStr, amount, unit, dateFormat = '%Y-%m-%d %H:%M:%S') {
  if (!datetimeStr) {
    throw new Error('datetime_str cannot be empty');
  }
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    throw new Error('amount must be a number');
  }
  if (!MS_PER_UNIT[unit]) {
    throw new Error(`unit must be one of: ${Object.keys(MS_PER_UNIT).join(', ')}`);
  }

  const startDate = parseDate(datetimeStr, dateFormat);
  const resultDate = new Date(startDate.getTime() + amount * MS_PER_UNIT[unit]);
  return formatDate(resultDate, dateFormat);
}

const addDurationToDatetimeSchema = {
  type: 'function',
  function: {
    name: 'add_duration_to_datetime',
    description:
      "Adds (or subtracts, using a negative amount) a duration to a given date/time and returns the resulting date/time. Use this whenever you need to calculate a date or time offset from a known starting point (e.g. 'what time is 90 minutes from now', 'what date is 3 weeks from a given date') — do NOT compute the offset yourself, since date/time arithmetic is easy to get wrong. Returns a single formatted date/time string.",
    parameters: {
      type: 'object',
      properties: {
        datetime_str: {
          type: 'string',
          description:
            "The starting date/time, formatted per date_format. Typically the output of get_current_datetime, e.g. '2026-07-10 19:22:40'.",
        },
        amount: {
          type: 'number',
          description: 'How much to add. Use a negative number to subtract instead.',
        },
        unit: {
          type: 'string',
          enum: ['seconds', 'minutes', 'hours', 'days', 'weeks'],
          description: 'The unit that amount is measured in.',
        },
        date_format: {
          type: 'string',
          description:
            "strftime-style format string, used to BOTH parse datetime_str and format the result. Must match the format datetime_str is actually written in. Defaults to '%Y-%m-%d %H:%M:%S' if omitted.",
        },
      },
      required: ['datetime_str', 'amount', 'unit'],
    },
  },
};

export {
  getCurrentDatetime,
  getCurrentDatetimeSchema,
  addDurationToDatetime,
  addDurationToDatetimeSchema,
};

