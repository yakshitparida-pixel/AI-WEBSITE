# Multi-AI Answer App

This app sends one question to multiple AI providers, then asks a chosen synthesizer model to combine the replies into one final answer.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   copy .env.example .env
   ```

3. Add one or more API keys to `.env`.

4. Start the app:

   ```bash
   npm start
   ```

5. Open:

   ```text
   http://localhost:3000
   ```

## How it works

- `server.js` calls the configured providers in parallel.
- The app currently supports OpenAI, Anthropic Claude, and Google Gemini.
- `SYNTH_PROVIDER` decides which configured provider writes the final combined answer.
- If the synthesizer is not configured, the app returns the raw model answers.

## Notes

Use API keys only on the server. Do not put provider keys in browser JavaScript.
