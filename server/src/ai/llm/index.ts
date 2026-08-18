import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";

export const llm = new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    temperature: 0.8,
    apiKey: process.env.OPENAI_API_KEY!,
});

export const groqModel = new ChatGroq({
    model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
    apiKey: process.env.GROQ_API_KEY!,
    temperature: 0,
});
