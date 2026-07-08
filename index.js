import 'dotenv/config';
import Groq from 'groq-sdk';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY, // this is actually the default, so it's optional
});

const rl = readline.createInterface({ input, output });

// 1. Prompt the user to enter some input
async function promptUser() {
  return rl.question('You: ');
}

// 2. Add a message to the running list of messages
function addMessage(messages, role, content) {
  messages.push({ role, content });
}

// 3. Call the API with the current message history
async function callApi(messages) {
  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 1024,
    messages,
  });

  return response.choices[0].message.content;
}

async function main() {
  const messages = [];

  while (true) {
    // 1. Prompt the user
    const userInput = await promptUser();
    if (userInput.trim().toLowerCase() === 'exit') break;

    // 2. Add it to the list of messages
    addMessage(messages, 'user', userInput);

    // 3. Call the API
    const reply = await callApi(messages);

    // 4. Add generated text to the list of messages
    addMessage(messages, 'assistant', reply);

    // 5. Print the generated text
    console.log(`Bot: ${reply}\n`);

    // 6. Repeat from #1 (loop continues)
  }

  rl.close();
}

main();