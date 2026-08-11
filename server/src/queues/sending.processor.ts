import type { Job } from "bull";
import { prismaClient } from "../lib/db.js";
import {
  hasSentMessageForEvent,
  isUniqueConstraintError,
  SENT_STATUS,
} from "../lib/messageDedupe.js";
import { sendWhatsAppMessage } from "../lib/twilio.js";
import { type MessageSendingJobData, type SendingResult } from "./types.js";

export async function processMessageSending(
  job: Job<MessageSendingJobData>
): Promise<SendingResult> {
  const { eventId, personId, userId, phoneNumber, message, tone } = job.data;

  // Last check before spending a WhatsApp send. The enqueue-time filter in
  // fetchTodayEvents runs once per batch, so a second trigger that overlaps an
  // in-flight batch can still reach this point. Bail out rather than deliver a
  // second copy of the same greeting.
  if (await hasSentMessageForEvent(eventId)) {
    console.log(
      `[Message Sending] Skipping job ${job.id}: event ${eventId} already has a ${SENT_STATUS} message this year`
    );

    return {
      eventId,
      personId,
      userId,
      phoneNumber,
      message,
      status: "SKIPPED",
      messageLength: message.length,
    };
  }

  try {
    console.log(
      `[Message Sending] Processing job ${job.id} to send to ${phoneNumber}`
    );

    // Send WhatsApp message
    await sendWhatsAppMessage(phoneNumber, message);

    console.log(
      `[Message Sending] Successfully sent message to ${phoneNumber}`
    );

    // Store SENT message in database.
    //
    // importantDateId is what makes this row visible to the duplicate check on
    // the next run. Without it the event looks unsent forever and the greeting
    // is re-delivered on every trigger.
    try {
      await prismaClient.messages.create({
        data: {
          content: message,
          style: tone,
          status: SENT_STATUS,
          messageLength: message.length,
          personId,
          userId,
          importantDateId: eventId,
        },
      });
    } catch (dbError) {
      // Lost a race against the partial unique index: another worker recorded a
      // SENT message for this event first. The row we care about exists, so
      // treat this as success instead of retrying the send.
      if (!isUniqueConstraintError(dbError)) {
        throw dbError;
      }

      console.warn(
        `[Message Sending] A ${SENT_STATUS} record already exists for event ${eventId} this year; skipping duplicate insert`
      );
    }

    return {
      eventId,
      personId,
      userId,
      phoneNumber,
      message,
      status: "SENT",
      messageLength: message.length,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error(
      `[Message Sending] Error in job ${job.id} for ${phoneNumber}:`,
      errorMessage
    );

    // Store FAILED message in database on final failure. FAILED rows are
    // deliberately excluded from the duplicate check and from the unique index,
    // so they never block a later attempt.
    if (job.attemptsMade >= job.opts.attempts!) {
      try {
        await prismaClient.messages.create({
          data: {
            content: message,
            style: tone,
            status: "FAILED",
            messageLength: message.length,
            personId,
            userId,
            importantDateId: eventId,
          },
        });
      } catch (dbError) {
        console.error(
          `[Message Sending] Failed to store error record for job ${job.id}:`,
          dbError
        );
      }
    }

    throw new Error(
      `Failed to send WhatsApp message to ${phoneNumber}: ${errorMessage}`
    );
  }
}

export async function setupSendingProcessor() {
  const { messageSendingQueue } = await import("./index.js");

  messageSendingQueue.process(3, processMessageSending);

  console.log("Message sending processor started (3 concurrent jobs)");
}
