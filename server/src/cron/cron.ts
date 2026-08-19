import cron from "node-cron";
import { sendTodayEventMessages } from "../ai/sendTodayEventMessages.js";

const schedule = "52 13 * * *";
const timezone = "Asia/Kolkata";
const enableInternalCron = process.env.ENABLE_INTERNAL_CRON !== "false";

if (enableInternalCron) {
    cron.schedule(
        schedule,
        async () => {
            console.log(`[Cron] Starting event delivery (${schedule} ${timezone})`);

            try {
                const jobIds = await sendTodayEventMessages();
                console.log(`[Cron] Queued ${jobIds.length} event message jobs`);
            } catch (error) {
                console.error("[Cron] Event delivery failed:", error);
            }
        },
        { timezone }
    );

    console.log(`[Cron] Scheduled event delivery at ${schedule} (${timezone})`);
} else {
    console.log("[Cron] Internal scheduler disabled; use POST /cron/send-events");
}