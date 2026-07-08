import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY, // this is actually the default, so it's optional
});

async function main() {
  const message = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'Hello, Claude! What can you help me with?' }
    ],
  });

  console.log(message.choices[0].message.content);
}

main();