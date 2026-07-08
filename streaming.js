/**
 * RESPONSE STREAMING DEMO
 * ========================
 *
 * WHAT IS STREAMING?
 * By default, an API call waits for the model to finish generating the
 * ENTIRE response before you get anything back. For long answers this
 * means sitting in silence for several seconds before a wall of text
 * appears all at once.
 *
 * Streaming changes this: the server sends the response back in small
 * pieces ("chunks") as soon as each piece is generated, instead of
 * waiting for the whole thing. This lets you print text to the screen
 * word-by-word / token-by-token as it's produced — just like watching
 * ChatGPT or Claude "type" an answer live.
 *
 * WHY USE IT?
 * - Better perceived performance — the user sees output immediately
 *   instead of staring at a blank screen.
 * - Useful for long responses, chat UIs, or anywhere you want a
 *   "live typing" effect.
 * - You can still get the final, fully-assembled message/usage stats
 *   once the stream finishes — you don't lose anything by streaming.
 *
 * HOW IT WORKS HERE (Groq / OpenAI-compatible API):
 * 1. Pass `stream: true` in the request instead of the default (false).
 * 2. Instead of one response object, you get back an async iterable.
 * 3. Loop over it with `for await (const chunk of stream)`.
 * 4. Each `chunk` contains a small piece of the reply in
 *    `chunk.choices[0].delta.content` (may be undefined/empty on some
 *    chunks, e.g. the very first one which only sets the role).
 * 5. Print/append each piece as it arrives.
 *
 * NOTE: We're using Groq (OpenAI-compatible SDK) here, not Anthropic,
 * since that's the API key we have available. The same underlying
 * concept — request with `stream: true`, consume chunks one by one —
 * applies to the Claude API too (there it's `anthropic.messages.stream()`
 * with a `.on('text', ...)` event instead of a for-await loop).
 */

import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function main() {
  const stream = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 500,
    messages: [
      { role: 'user', content: 'Write a short paragraph about the ocean.' }
    ],
    stream: true, // <-- this is what turns streaming on
  });

  let fullText = '';

  // Print each chunk of text as it arrives, instead of waiting for
  // the full response.
  for await (const chunk of stream) {
    const textChunk = chunk.choices[0]?.delta?.content || '';
    fullText += textChunk;
    process.stdout.write(textChunk);
  }

  console.log('\n\n--- Done. Total characters received:', fullText.length);
}

main();
