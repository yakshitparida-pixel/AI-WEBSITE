import "dotenv/config";
import express from "express";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const providerMap = {
  openai: {
    enabled: Boolean(process.env.OPENAI_API_KEY),
    label: "OpenAI",
    ask: askOpenAI
  },
  anthropic: {
    enabled: Boolean(process.env.ANTHROPIC_API_KEY),
    label: "Anthropic Claude",
    ask: askAnthropic
  },
  gemini: {
    enabled: Boolean(process.env.GEMINI_API_KEY),
    label: "Google Gemini",
    ask: askGemini
  }
};

app.post("/api/ask", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();

    if (!question) {
      return res.status(400).json({ error: "Please enter a question." });
    }

    const providers = Object.entries(providerMap)
      .filter(([, provider]) => provider.enabled)
      .map(([id, provider]) => ({ id, ...provider }));

    if (providers.length === 0) {
      return res.status(400).json({
        error: "No API keys are configured. Add keys to your .env file first."
      });
    }

    const modelAnswers = await Promise.all(
      providers.map(async (provider) => {
        try {
          const answer = await provider.ask(question);
          return {
            provider: provider.id,
            label: provider.label,
            answer
          };
        } catch (error) {
          return {
            provider: provider.id,
            label: provider.label,
            error: error.message || "Provider failed."
          };
        }
      })
    );

    const usableAnswers = modelAnswers.filter((item) => item.answer);

    if (usableAnswers.length === 0) {
      return res.status(502).json({
        error: "All configured providers failed.",
        modelAnswers
      });
    }

    const finalAnswer = await synthesizeAnswer(question, usableAnswers);

    res.json({
      finalAnswer,
      modelAnswers
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Something went wrong." });
  }
});

async function askOpenAI(question) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1",
      input: [
        {
          role: "system",
          content: "Answer clearly, accurately, and concisely."
        },
        {
          role: "user",
          content: question
        }
      ]
    })
  });

  const data = await parseProviderResponse(response, "OpenAI");
  return data.output_text || extractOpenAIText(data);
}

async function askAnthropic(question) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
      max_tokens: 1200,
      system: "Answer clearly, accurately, and concisely.",
      messages: [{ role: "user", content: question }]
    })
  });

  const data = await parseProviderResponse(response, "Anthropic");
  return data.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

async function askGemini(question) {
  const model = process.env.GEMINI_MODEL || "gemini-1.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "Answer clearly, accurately, and concisely." }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: question }]
        }
      ]
    })
  });

  const data = await parseProviderResponse(response, "Gemini");
  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function synthesizeAnswer(question, answers) {
  const synthesisPrompt = [
    "You are combining multiple AI model answers into one best answer.",
    "Use the strongest points, remove repetition, resolve conflicts carefully, and say when the sources disagree.",
    "",
    `User question: ${question}`,
    "",
    "Model answers:",
    ...answers.map(
      (item, index) => `\n[${index + 1}] ${item.label}\n${item.answer}`
    )
  ].join("\n");

  const synthProvider = process.env.SYNTH_PROVIDER || "openai";
  const provider = providerMap[synthProvider];

  if (provider?.enabled) {
    return provider.ask(synthesisPrompt);
  }

  const fallback = answers.map((item) => `${item.label}: ${item.answer}`).join("\n\n");
  return `No synthesizer provider is configured, so here are the raw answers:\n\n${fallback}`;
}

async function parseProviderResponse(response, providerName) {
  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${providerName} returned a non-JSON response.`);
  }

  if (!response.ok) {
    const message =
      data.error?.message ||
      data.error?.error?.message ||
      data.message ||
      `${providerName} request failed.`;
    throw new Error(message);
  }

  return data;
}

function extractOpenAIText(data) {
  return data.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("\n")
    .trim();
}

if (process.env.VERCEL !== "1") {
  app.listen(port, () => {
    console.log(`Multi-AI app running at http://localhost:${port}`);
  });
}

export default app;
