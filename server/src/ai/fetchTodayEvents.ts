import { prismaClient } from "../lib/db.js";

/**
 * Queries the database only for important dates whose month/day
 * matches the provided values.  The previous implementation fetched *all*
 * rows and then filtered in JS, which becomes wasteful as the table grows.
 *
 * We perform a lightweight raw query to collect leading ids, then load the
 * full records with the necessary relations in a second step.  This keeps the
 * bulk of the filtering inside PostgreSQL and avoids loading unrelated data
 * into memory.
 */
async function getEventsByMonthDay(month: number, day: number) {
    // first grab matching date ids using SQL EXTRACT
    const rows: Array<{ id: string }> = await prismaClient.$queryRaw`
        SELECT id
        FROM "Important_Dates"          -- use quoted model-derived table name
        WHERE EXTRACT(MONTH FROM date_value) = ${month}
          AND EXTRACT(DAY FROM date_value) = ${day}
    `;

    if (rows.length === 0) {
        return [];
    }

    const ids = rows.map(r => r.id);
    return prismaClient.important_Dates.findMany({
        where: { id: { in: ids } },
        include: {
            people: {
                include: {
                    user: true,
                    messages: true,
                },
            },
        },
    });
}

function filterTodayUnsentEvents(events: any[]) {
    const today = new Date();
    const currentYear = today.getUTCFullYear();

    return events.filter(event => {
        const messages = event.people.messages ?? [];

        // Only check messages for THIS SPECIFIC EVENT, not all messages for the person
        const alreadySentThisYear = messages.some(
            (msg: { sentAt: Date; status: string; importantDateId: string }) =>
                msg.importantDateId === event.id &&
                new Date(msg.sentAt).getUTCFullYear() === currentYear &&
                msg.status === "SENT"
        );

        return !alreadySentThisYear;
    });
}

export async function getTodayPendingEvents() {
    const today = new Date();
    const month = today.getUTCMonth() + 1;
    const day = today.getUTCDate();

    // fetch only events whose month/day match today
    const todaysEvents = await getEventsByMonthDay(month, day);
    const pendingEvents = filterTodayUnsentEvents(todaysEvents);

    console.log(
        "Events to send today:",
        pendingEvents,
        pendingEvents.length,
        "out of",
        todaysEvents
    );

    return pendingEvents;
}
