import {
    ConversationFlow,
    ConversationStep,
    OnboardingStep,
} from "@prisma/client";
import { type Request, type Response } from "express";
import { prismaClient } from "../lib/db.js";
import { sendWhatsAppMessage } from "../lib/twilio.js";
import { handleAddPerson } from "./handlers/addPersonHandler.js";
import { handleOnboarding } from "./handlers/onboardingHandler.js";
import { resetConversation, startConversation } from "./helpers/whatsappHelpers.js";
import { transcribeAudio } from "./utils/transcription.js";

export default async function whatsappWebhook(
    req: Request,
    res: Response
) {
    const acknowledgeWebhook = () =>
        res.type("text/xml").send("<Response></Response>");
    const escapeXml = (value: string) =>
        value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    const sendReply = async (to: string, reply: string) => {
        try {
            await sendWhatsAppMessage(to, reply);
            return acknowledgeWebhook();
        } catch (error) {
            console.error("WhatsApp reply failed; returning TwiML fallback:", error);
            return res
                .type("text/xml")
                .send(
                    `<Response><Message>${escapeXml(
                        "Something went wrong while sending your message. Please try again in a few minutes."
                    )}</Message></Response>`
                );
        }
    };

    try {
        const from = req.body.From?.replace("whatsapp:", "");
        let message = req.body.Body?.trim();

        console.log('/webhooks/whatsapp', from, message);

        const numMedia = parseInt(req.body.NumMedia || "0", 10);
        if (numMedia > 0 && req.body.MediaContentType0?.startsWith('audio/')) {
            const audioUrl = req.body.MediaUrl0;
            try {
                message = await transcribeAudio(audioUrl);
                console.log('Transcribed message:', message);
                if (!message || message.trim() === '') {
                    return sendReply(from, "Sorry, I couldn't understand your voice note. Please try again or send a text message.");
                }
            } catch (error) {
                console.error('Transcription error:', error);
                return sendReply(from, "Sorry, I couldn't process your voice note. Please send a text message instead.");
            }
        }

        if (!from || !message) {
            return acknowledgeWebhook();
        }

        let user = await prismaClient.user.findUnique({
            where: { whatsappNumber: from },
        });

        // 1️⃣ New user
        if (!user) {
            user = await prismaClient.user.create({
                data: {
                    whatsappNumber: from,
                    onboardingStep: OnboardingStep.ASK_NAME,
                },
            });

            return sendReply(from, "Hey 👋 What should I call you?");
        }

        // 2️⃣ Onboarding flow
        if (user.onboardingStep !== OnboardingStep.READY) {
            const reply = await handleOnboarding(user.id, message);
            return sendReply(from, reply);
        }

        // 3️⃣ Command handling
        const lower = message.toLowerCase();

        if (lower === "add person") {
            await startConversation(
                user.id,
                ConversationFlow.ADD_PERSON,
                ConversationStep.ASK_PERSON_NAME
            );

            return sendReply(from, "Sure 🙂 What’s the person’s name?");
        }

        if (lower === "cancel") {
            await resetConversation(user.id);
            return sendReply(from, "❌ Action cancelled. You can type *Add person* anytime.");
        }

        // 4️⃣ Conversation flow
        if (user.conversationFlow === ConversationFlow.ADD_PERSON) {
            const reply = await handleAddPerson(user, message);
            return sendReply(from, reply);
        }

        // 5️⃣ Default fallback
        return sendReply(
            from,
            "I didn’t understand that 🤔\nType *Add person* to add someone."
        );
    } catch (error) {
        console.error("WhatsApp webhook error:", error);
        if (req.body.From) {
            res.type("text/xml").send(
                "<Response><Message>Something went wrong while processing your message. Please try again in a few minutes.</Message></Response>"
            );
            return;
        }

        acknowledgeWebhook();
    }
}
