import cron from "node-cron";
import { sendTodayEventMessages } from "../ai/sendTodayEventMessages.js";

cron.schedule("2 4 * * *", async () => {
    await sendTodayEventMessages()
},
    { timezone: "Asia/Kolkata", }
);