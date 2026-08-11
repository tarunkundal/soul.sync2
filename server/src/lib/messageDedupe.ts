import { prismaClient } from "./db.js";

/**
 * Status written to Messages once a WhatsApp send has been attempted
 * successfully. Also the status the duplicate check keys off, and the status
 * the partial unique index in the database is scoped to.
 */
export const SENT_STATUS = "SENT";

/**
 * UTC calendar-year window used to scope the duplicate check.
 *
 * `Messages.sent_at` is a `timestamp without time zone` holding UTC, and the
 * database-level unique index uses `date_part('year', sent_at)`, so the
 * application must use UTC boundaries to agree with it.
 */
export function currentYearRangeUtc(now: Date = new Date()) {
    const year = now.getUTCFullYear();

    return {
        year,
        start: new Date(Date.UTC(year, 0, 1)),
        end: new Date(Date.UTC(year + 1, 0, 1)),
    };
}

/**
 * Prisma filter matching a SENT message recorded in the current calendar year.
 * Shared so the enqueue-time check and the send-time check can never drift
 * apart.
 */
export function sentThisYearFilter(now: Date = new Date()) {
    const { start, end } = currentYearRangeUtc(now);

    return {
        status: SENT_STATUS,
        sentAt: { gte: start, lt: end },
    };
}

/**
 * True when a SENT message is already recorded against this important date in
 * the current calendar year.
 */
export async function hasSentMessageForEvent(
    importantDateId: string,
    now: Date = new Date()
): Promise<boolean> {
    const existing = await prismaClient.messages.findFirst({
        where: {
            importantDateId,
            ...sentThisYearFilter(now),
        },
        select: { id: true },
    });

    return existing !== null;
}

/**
 * Prisma throws P2002 when a unique constraint is violated. Used to recognise
 * a losing race against the partial unique index on Messages.
 */
export function isUniqueConstraintError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
    );
}
