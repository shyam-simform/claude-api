import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function askAt(temperature) {
  const message = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 100,
    temperature,
    messages: [
      { role: 'user', content: 'Write one sentence describing a rainy day.' }
    ],
  });
  console.log(`Temperature ${temperature}:`, message.choices[0].message.content);
}

async function main() {
  await askAt(0);   // run this twice — answer will barely change
  await askAt(1);   // run this twice — answer will vary noticeably
}

main();
