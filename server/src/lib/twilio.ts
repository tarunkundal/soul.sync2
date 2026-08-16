import Twilio from "twilio";

const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
);

/**
 * Sends a WhatsApp message and resolves with Twilio's message resource.
 *
 * Throws on failure. Callers depend on that: the sending processor treats a
 * rejection as the signal to retry and eventually dead-letter the job, and it
 * only records a SENT message once this resolves. Swallowing the error here
 * would make a failed delivery indistinguishable from a successful one, which
 * both loses the message and — because a SENT row satisfies the duplicate
 * check — permanently blocks any later attempt for that event.
 *
 * Every call site is inside a try/catch, so propagating is safe.
 */
export async function sendWhatsAppMessage(
    to: string,
    message: string
) {
    try {
        const messageResponse = await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER!,
            to: `whatsapp:${to}`,
            body: message,
        });

        // Log the identifiers rather than the whole resource, which is noisy
        // and echoes the message body back into the logs.
        console.log(
            `WhatsApp message accepted by Twilio: sid=${messageResponse.sid} status=${messageResponse.status}`
        );

        return messageResponse;
    } catch (error) {
        console.error(
            `Failed to send WhatsApp message to ${to}:`,
            error instanceof Error ? error.message : error
        );

        throw error;
    }
}
