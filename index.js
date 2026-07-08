import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY, // this is actually the default, so it's optional
});

async function main() {
  // The Groq API is stateless — the full conversation history must be
  // resent on every request, so we accumulate turns in this array.
  const messages = [
    { role: 'user', content: 'Hello! What can you help me to understand the concept of machine learning?' }
  ];

  const message = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 1024,
    messages,
  });

  const reply = message.choices[0].message.content;
  console.log(reply);

  // Append the assistant's reply, then the next user turn, before the
  // second call so the model sees the prior exchange as context.
  messages.push({ role: 'assistant', content: reply });
  messages.push({ role: 'user', content: 'Can you give me an example?' });

  const message2 = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 1024,
    messages,
  });

  console.log(message2.choices[0].message.content);
}

main();