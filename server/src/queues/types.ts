// Job data types for Bull MQ queues

export interface MessageGenerationJobData {
    eventId: string;
    personId: string;
    userId: string;
    senderName: string;
    receiverName: string;
    relation: string;
    eventType: string;
    tone: string;
    phoneNumber: string;
}

export interface MessageSendingJobData {
    eventId: string;
    personId: string;
    userId: string;
    phoneNumber: string;
    message: string;
    tone: string;
}

export interface GeneratedMessageResult {
    eventId: string;
    personId: string;
    userId: string;
    phoneNumber: string;
    message: string;
    tone: string;
}

export interface SendingResult {
    eventId: string;
    personId: string;
    userId: string;
    phoneNumber: string;
    message: string;
    status: "SENT" | "FAILED" | "SKIPPED";
    messageLength: number;
    error?: string;
}

export interface DLQEntry {
    jobId: string;
    jobType: "MESSAGE_GENERATION" | "MESSAGE_SENDING";
    data: MessageGenerationJobData | MessageSendingJobData;
    error: string;
    attempts: number;
    timestamp: Date;
    result?: GeneratedMessageResult | SendingResult;
}
