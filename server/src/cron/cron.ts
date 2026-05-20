import cron from "node-cron";
import { sendTodayEventMessages } from "../ai/sendTodayEventMessages.js";

cron.schedule("2 19 * * *", async () => {
    await sendTodayEventMessages()
},
    { timezone: "Asia/Kolkata", }
);