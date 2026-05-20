import { messageGenerationQueue } from "../queues/index.js";
import type { MessageGenerationJobData } from "../queues/types.js";
import { getTodayPendingEvents } from "./fetchTodayEvents.js";

/**
 * Queue all pending events for the day into the message generation queue
 * This function is non-blocking and returns immediately after queueing all jobs
 */
export async function sendTodayEventMessages() {
    try {
        const events = await getTodayPendingEvents();

        console.log(`[Event Messages] Queueing ${events.length} events for processing`);

        const jobIds: string[] = [];

        // Queue all events for message generation
        for (const event of events) {
            const person = event.people;
            const user = person.user;

            // Skip if WhatsApp not enabled or phone missing
            if (!person.phoneNumber) {
                console.warn(`[Event Messages] Skipping person ${person.id} - no phone number`);
                continue;
            }

            const jobData: MessageGenerationJobData = {
                eventId: event.id,
                personId: person.id,
                userId: user.id,
                senderName: user.fullName ?? "Someone special",
                receiverName: person.name,
                relation: person.relationshipType,
                eventType: event.dateType,
                tone: person.aiTonePreference,
                phoneNumber: person.phoneNumber,
            };

            try {
                const job = await messageGenerationQueue.add(jobData, {
                    jobId: `gen-${event.id}-${person.id}`,
                    priority: 20, // Higher priority for message generation
                });

                jobIds.push(job.id!.toString());

                console.log(
                    `[Event Messages] Queued message generation for event ${event.id}, person ${person.name}`
                );
            } catch (error) {
                console.error(
                    `[Event Messages] Error queueing job for person ${person.id}:`,
                    error
                );
            }
        }

        console.log(
            `[Event Messages] Successfully queued ${jobIds.length} message generation jobs`
        );

        return jobIds;
    } catch (error) {
        console.error("[Event Messages] Error in sendTodayEventMessages:", error);
        throw error;
    }
}
