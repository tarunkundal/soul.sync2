import { prismaClient } from "../lib/db.js";
import { sentThisYearFilter } from "../lib/messageDedupe.js";

/**
 * Loads the important dates falling on the given month/day that do NOT already
 * have a SENT message recorded for the current calendar year.
 *
 * Both filters run inside PostgreSQL:
 *   - month/day match via EXTRACT on date_value
 *   - "already sent" via a NOT EXISTS anti-join on Messages.important_date_id
 *
 * The anti-join replaces the previous approach of eagerly loading every message
 * ever sent to a person and matching in JS, which was both unbounded and — since
 * important_date_id was never populated — always evaluated to "not sent".
 */
async function getPendingEventsByMonthDay(month: number, day: number) {
    // First collect the ids whose month/day match today. EXTRACT keeps this in
    // the database rather than pulling the whole table into memory.
    const rows: Array<{ id: string }> = await prismaClient.$queryRaw`
        SELECT id
        FROM "Important_Dates"          -- quoted model-derived table name
        WHERE EXTRACT(MONTH FROM date_value) = ${month}
          AND EXTRACT(DAY FROM date_value) = ${day}
    `;

    if (rows.length === 0) {
        return [];
    }

    const ids = rows.map(r => r.id);

    return prismaClient.important_Dates.findMany({
        where: {
            id: { in: ids },
            // Exclude anything already delivered this year. `messages` here is
            // the Important_Dates -> Messages relation, so it is scoped to this
            // specific event rather than to the person as a whole.
            messages: {
                none: sentThisYearFilter(),
            },
        },
        include: {
            people: {
                include: {
                    user: true,
                },
            },
        },
    });
}

export async function getTodayPendingEvents() {
    const today = new Date();
    const month = today.getUTCMonth() + 1;
    const day = today.getUTCDate();

    const pendingEvents = await getPendingEventsByMonthDay(month, day);

    console.log(
        `[Event Messages] ${pendingEvents.length} event(s) pending for ${month}/${day}`,
        pendingEvents.map(event => ({
            eventId: event.id,
            eventType: event.dateType,
            personId: event.personId,
        }))
    );

    return pendingEvents;
}
