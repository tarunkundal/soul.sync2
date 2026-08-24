import { ChatPromptTemplate } from "@langchain/core/prompts";
import { groqModel } from "./index.js";

type GenerateEventMessageInput = {
    senderName: string;
    receiverName: string;
    relation: string;
    eventType: string;
    tone: string;
    language?: string;
};

export async function generateEventMessage({
    senderName,
    receiverName,
    relation,
    eventType,
    tone,
    language = "en",
}: GenerateEventMessageInput): Promise<string> {
    const prompt = ChatPromptTemplate.fromTemplate(`
You are an invisible writing assistant. Write a WhatsApp message exactly as if it came
from the sender. The receiver must never feel that an AI wrote it.

CONTEXT:
- Event: {eventType}
- Tone: {tone}
- Language: {language}

SENDER:
{senderName}

RECEIVER:
{receiverName} ({relation})

RULES:
- Max 40 - 50 words
- Friendly and natural WhatsApp style
- Sound personal, specific, and believable for this relationship
- Use the sender's voice profile as style guidance, never mention or expose it
- Prefer simple words, natural contractions, and the sender's usual level of warmth
- Do not invent shared memories, private details, promises, or feelings not provided
- Never say you are an AI, assistant, or writing on someone else's behalf
- No hashtags
- No emojis overload (0–2 emojis max)
- No quotes, no signatures
- Output only the message text
`);

    const chain = prompt.pipe(
        groqModel.withConfig({
            temperature: 0.7,
        })
    );

    const response = await chain.invoke({
        senderName,
        receiverName,
        relation,
        eventType,
        tone,
        language,
    });

    return extractText(response).trim();
}

/* =========================
   HELPERS
========================= */

function extractText(response: any): string {
    if (typeof response?.content === "string") {
        return response.content;
    }

    if (Array.isArray(response?.content)) {
        return response.content
            .map((block: { text: any; }) =>
                typeof block === "string"
                    ? block
                    : block?.text ?? ""
            )
            .join("");
    }

    return "";
}
