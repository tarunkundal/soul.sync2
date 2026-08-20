import { ConversationStep } from "@prisma/client";
import { extractStructured } from "../../ai/llm/extract.js";
import { aiToneSchema, dateSchema, eventTypeSchema, personNameSchema, phoneSchema, relationSchema } from "../../ai/llm/schema.js";
import { prismaClient } from "../../lib/db.js";
import { normalizeIndianPhone, resetConversation, tempStore, updateConversation } from "../helpers/whatsappHelpers.js";

/* =========================
   ADD PERSON FLOW
========================= */

export async function handleAddPerson(user: any, message: string) {
    const temp = tempStore.get(user.id) || {};

    switch (user.conversationStep) {
        case ConversationStep.ASK_PERSON_NAME: {
            const result = await extractStructured({
                step: "ASK_PERSON_NAME",
                question: "What’s the person’s name?",
                userMessage: message,
                schema: personNameSchema,
                formatInstructions: `{ "name": "string"}`,
            });
            if (!result.ok) {
                return "❌ Please provide a valid name.";
            }
            temp.name = result.data.name;
            tempStore.set(user.id, temp);

            await updateConversation(user.id, ConversationStep.ASK_PERSON_PHONE);
            return "Please share their * WhatsApp number * 📱\n\nJust the number is fine.\nI’ll automatically add the country code if needed or you can include the *Country Code* (eg: +91)";
        }
        case ConversationStep.ASK_PERSON_PHONE: {
            const result = await extractStructured({
                step: "ASK_PERSON_PHONE",
                question: "What’s their WhatsApp number?",
                userMessage: message,
                schema: phoneSchema,
                formatInstructions: `{ "phoneNumber": "string" }`,
            });
            console.log('phone number ', result, message)

            if (!result.ok) {
                return (
                    "Sorry 😕 I couldn’t understand that.\n\n" +
                    "Please send a *10-digit WhatsApp number* (India 🇮🇳)."
                );
            }

            const phoneResult = normalizeIndianPhone(result.data.phoneNumber);

            if (!phoneResult.ok) {
                return (
                    "Hmm 🤔 that doesn’t look like a valid *WhatsApp number*.\n\n" +
                    "Please send a *10-digit mobile number*."
                );
            }

            temp.phone = phoneResult.phone;
            tempStore.set(user.id, temp);

            // check if contact already exists for this user
            const already = await prismaClient.people.findFirst({
                where: { userId: user.id, phoneNumber: phoneResult.phone },
            });
            if (already) {
                temp.existingPersonId = already.id;
                temp.name = already.name; // use existing name
                temp.relation = already.relationshipType; // use existing relation
                temp.aiTone = already.aiTonePreference; // use existing tone
                if (already.phoneNumber) {
                    temp.phone = already.phoneNumber;
                };
                tempStore.set(user.id, temp);
                await updateConversation(user.id, ConversationStep.ASK_EVENT_TYPE);
                return `This WhatsApp number is already added as *${already.name}*. I'll add another event for them. What kind of *event* you want to wish for?\n\nFor example:\n• *Birthday*\n• *Anniversary*\n• *Meeting*\n• *Other*`;
            }

            await updateConversation(user.id, ConversationStep.ASK_PERSON_RELATION);

            return (
                "Got it ✅\n\n" +
                "How are they related to you?\n" +
                "• *Friend*\n" +
                "• *Parent*\n" +
                "• *Partner*\n" +
                "• *Colleague*"
            );
        }
        case ConversationStep.ASK_PERSON_RELATION: {
            const result = await extractStructured({
                step: "ASK_PERSON_RELATION",
                question: "How are they related to you?",
                userMessage: message,
                schema: relationSchema,
                formatInstructions: `{ "relationshipType": "mother | father | friend | colleague | family | partner | spouse | sibling | other"}`,
            });
            if (!result.ok) {
                return "❌ Please provide a valid relationship type (friend, parent, partner, colleague).";
            }
            const { relationshipType } = result.data;
            temp.relation = relationshipType;
            tempStore.set(user.id, temp);

            await updateConversation(user.id, ConversationStep.ASK_EVENT_TYPE);
            return "Nice 👍 What kind of * event * you want to wish for ?\n\nFor example: \n• * Birthday *\n• * Anniversary *\n• * Meeting *\n• * Other *";
        }
        case ConversationStep.ASK_EVENT_TYPE: {
            const result = await extractStructured({
                step: "ASK_EVENT_TYPE",
                question: "What is the event?",
                userMessage: message,
                schema: eventTypeSchema,
                formatInstructions: `{ "eventType": "birthday | anniversary | wedding | graduation | other"}`,
            });

            if (!result.ok) {
                return "❌ Please choose one: birthday, anniversary, wedding, graduation, other.";
            }

            const eventType = result.data.eventType.toUpperCase();

            // if existing person, check if this event type already exists
            if (temp.existingPersonId) {
                const existingDate = await prismaClient.important_Dates.findFirst({
                    where: {
                        personId: temp.existingPersonId,
                        dateType: eventType,
                    },
                });
                if (existingDate) {
                    delete temp.eventType;
                    delete temp.date;
                    delete temp.aiTone;
                    tempStore.set(user.id, temp);
                    await updateConversation(user.id, ConversationStep.ASK_EVENT_TYPE);
                    return `⚠️ ${temp.name} already has a ${eventType.toLowerCase()} event. Please choose a different event type.`;
                }
            }

            temp.eventType = result.data.eventType;
            tempStore.set(user.id, temp);

            await updateConversation(user.id, ConversationStep.ASK_EVENT_DATE);
            return "Got it 🎉 What’s the event date? (YYYY-MM-DD)";
        }

        case ConversationStep.ASK_EVENT_DATE: {
            const result = await extractStructured({
                step: "ASK_EVENT_DATE",
                question: "What’s the event important date?",
                userMessage: message,
                schema: dateSchema,
                formatInstructions: `{"dateValue": "YYYY-MM-DD"}`,
            });
            if (!result.ok) {
                return "❌ Please provide a valid date in YYYY-MM-DD format. Example: *1990-05-21*.";
            }
            const { dateValue } = result.data;
            temp.date = dateValue;
            await updateConversation(user.id, ConversationStep.ASK_AI_TONE);
            return "How would you like the message to sound? 😊\n\nChoose a *tone*:\n• *Warm*\n• *Funny*\n• *Formal*\n• *Emotional*\n• *Romantic*"
        }
        case ConversationStep.ASK_AI_TONE: {
            const result = await extractStructured({
                step: "ASK_AI_TONE",
                question: "How should the message sound?",
                userMessage: message,
                schema: aiToneSchema,
                formatInstructions: `{ "aiTone": "romantic | emotional | funny | professional | friendly"}`,
            });

            if (!result.ok) {
                return "❌ Choose one tone: romantic, emotional, funny, professional, friendly.";
            }

            temp.aiTone = result.data.aiTone;
            tempStore.set(user.id, temp);

            await updateConversation(user.id, ConversationStep.CONFIRM_PERSON);

            return `Please confirm 👇
                    Name: ${temp.name}
                    Phone: ${temp.phone}
                    Relation: ${temp.relation}
                    Event: ${temp.eventType}
                    Date: ${temp.date}
                    Tone: ${temp.aiTone}

                    Reply *Yes* to save or *Cancel*`;
        }

        case ConversationStep.CONFIRM_PERSON: {
            if (message.toLowerCase() !== "yes") {
                await resetConversation(user.id);
                tempStore.delete(user.id);
                return "❌ Not saved. Type *Add person* to try again.";
            }

            if (temp.existingPersonId) {
                // add new important date to existing person
                try {
                    await prismaClient.important_Dates.create({
                        data: {
                            personId: temp.existingPersonId,
                            dateType: temp.eventType!.toUpperCase(),
                            dateValue: new Date(temp.date!),
                        },
                    });
                } catch (err: any) {
                    if (err?.code === "P2002") {
                        await resetConversation(user.id);
                        tempStore.delete(user.id);
                        return `⚠️ Failed to add event. ${temp.name} might already have this event type.`;
                    }
                    throw err;
                }
            } else {
                // validate all required fields for new person
                if (!temp.name || !temp.phone || !temp.relation || !temp.eventType || !temp.date || !temp.aiTone) {
                    await resetConversation(user.id);
                    tempStore.delete(user.id);
                    return "❌ Some information is missing. Please start over by typing *Add person*.";
                }

                // make sure we don't create a duplicate entry
                const existing = await prismaClient.people.findFirst({
                    where: { userId: user.id, phoneNumber: temp.phone! },
                });
                if (existing) {
                    await resetConversation(user.id);
                    tempStore.delete(user.id);
                    return (
                        "⚠️ You already added someone with that WhatsApp number. " +
                        "Type *Add person* if you want to add somebody else."
                    );
                }

                try {
                    await prismaClient.people.create({
                        data: {
                            name: temp.name!,
                            phoneNumber: temp.phone!,
                            relationshipType: temp.relation!,
                            aiTonePreference: temp.aiTone!,
                            userId: user.id,
                            importantDates: {
                                create: {
                                    dateType: temp.eventType!.toUpperCase(),
                                    dateValue: new Date(temp.date!),
                                },
                            },
                        },
                    });
                } catch (err: any) {
                    // catch unique constraint just in case our pre-check missed it
                    if (
                        err?.code === "P2002" &&
                        err?.meta?.target?.includes("phone_number")
                    ) {
                        await resetConversation(user.id);
                        tempStore.delete(user.id);
                        return (
                            "⚠️ That contact already exists for your account. " +
                            "Type *Add person* if you want to add somebody else."
                        );
                    }
                    throw err;
                }
            }

            await resetConversation(user.id);
            tempStore.delete(user.id);

            return "✅ Person added successfully! 🎉";
        }
        default:
            return "Something went wrong 🤕 Please type *Add person* again.";
    }
}