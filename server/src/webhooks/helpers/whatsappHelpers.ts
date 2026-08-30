import { ConversationFlow, ConversationStep, Prisma } from "@prisma/client";
import { z } from "zod";
import { prismaClient } from "../../lib/db.js";

/**
 * Answers collected so far in an in-progress conversation.
 *
 * Persisted on `User.conversationData` rather than held in process memory, so a
 * restart or a second replica can pick a conversation up mid-flow. The payload
 * is written in the same UPDATE as `conversationStep`, which keeps the two from
 * drifting apart — the previous in-memory Map could be empty while the database
 * still claimed the user was at CONFIRM_PERSON.
 */
const conversationDataSchema = z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    relation: z.string().optional(),
    eventType: z.string().optional(),
    date: z.string().optional(),
    aiTone: z.string().optional(),
    existingPersonId: z.string().optional(),
});

export type ConversationData = z.infer<typeof conversationDataSchema>;

/**
 * What actually goes in the column. The `updatedAt` stamp is what lets stale
 * payloads be aged out; the JSON column has no per-row TTL of its own.
 */
const storedConversationSchema = z.object({
    updatedAt: z.string(),
    data: conversationDataSchema,
});

/**
 * Abandoned conversations are treated as absent after this long. 24h matches
 * WhatsApp's session window: past it the user has to re-initiate the chat
 * anyway, so silently resuming a half-finished form would be more confusing
 * than starting over.
 */
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

function toStoredJson(data: ConversationData): Prisma.InputJsonObject {
    // undefined is not valid JSON and Prisma rejects it, so drop those keys
    // instead of relying on serialisation to swallow them.
    const payload: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
            payload[key] = value;
        }
    }

    return {
        updatedAt: new Date().toISOString(),
        data: payload,
    };
}

/**
 * Reads the payload off an already-fetched User row. Taking the row rather than
 * an id avoids a second query and, more importantly, means the payload comes
 * from the same snapshot as `conversationStep`.
 *
 * Missing, expired, and unreadable payloads all collapse to `{}` — callers
 * treat that the same way they treated a Map miss.
 */
export function readConversationData(user: {
    conversationData: Prisma.JsonValue | null;
}): ConversationData {
    if (user.conversationData === null) {
        return {};
    }

    const stored = storedConversationSchema.safeParse(user.conversationData);

    if (!stored.success) {
        console.warn(
            "[Conversation] Discarding unreadable conversationData payload"
        );
        return {};
    }

    const savedAt = Date.parse(stored.data.updatedAt);

    if (Number.isNaN(savedAt) || Date.now() - savedAt > CONVERSATION_TTL_MS) {
        return {};
    }

    return stored.data.data;
}

/**
 * Advances the conversation. Passing `data` persists the payload in the same
 * statement as the step, so a handler cannot move a user forward while leaving
 * their answers behind.
 */
export async function updateConversation(
    userId: string,
    step: ConversationStep,
    data?: ConversationData
) {
    await prismaClient.user.update({
        where: { id: userId },
        data: {
            conversationStep: step,
            ...(data !== undefined && { conversationData: toStoredJson(data) }),
        },
    });
}

/** Starts a flow from a clean slate, discarding any leftover payload. */
export async function startConversation(
    userId: string,
    flow: ConversationFlow,
    step: ConversationStep
) {
    await prismaClient.user.update({
        where: { id: userId },
        data: {
            conversationFlow: flow,
            conversationStep: step,
            conversationData: Prisma.DbNull,
        },
    });
}

/** Ends the flow and drops the payload. Subsumes the old `tempStore.delete`. */
export async function resetConversation(userId: string) {
    await prismaClient.user.update({
        where: { id: userId },
        data: {
            conversationFlow: ConversationFlow.NONE,
            conversationStep: ConversationStep.NONE,
            conversationData: Prisma.DbNull,
        },
    });
}

export function normalizeIndianPhone(input: string): {
    ok: true;
    phone: string;
} | {
    ok: false;
    reason: string;
} {
    const digits = input.replace(/\D/g, "");

    // Remove country code if user typed it
    let local = digits;

    if (digits.startsWith("91") && digits.length === 12) {
        local = digits.slice(2);
    }

    if (local.length !== 10) {
        return {
            ok: false,
            reason: "Phone number must be exactly 10 digits",
        };
    }

    return {
        ok: true,
        phone: `+91${local}`,
    };
}
