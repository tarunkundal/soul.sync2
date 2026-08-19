import "dotenv/config";

import { expressMiddleware } from '@as-integrations/express4';
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import { sendTodayEventMessages } from "./ai/sendTodayEventMessages.js";
import './cron/cron.js';
import { createContext } from './graphql/context.js';
import createGraphqlApolloServer from './graphql/index.js';
import { setupDLQHandlers } from "./queues/dlq.handler.js";
import { setupGenerationProcessor } from "./queues/generation.processor.js";
import { closeQueues } from "./queues/index.js";
import { getDLQJobs, getQueueMetrics } from "./queues/metrics.js";
import { setupSendingProcessor } from "./queues/sending.processor.js";
import whatsappWebhook from "./webhooks/whatsapp.js";

async function initializeQueues() {
    try {
        console.log("[Queues] Initializing queue processors...");
        await setupGenerationProcessor();
        await setupSendingProcessor();
        await setupDLQHandlers();
        console.log("[Queues] All processors initialized successfully");
    } catch (error) {
        console.error("[Queues] Error initializing queues:", error);
        throw error;
    }
}

async function init() {
    const app: Application = express()
    const PORT = parseInt(process.env.PORT || "8080", 10)

    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(express.json())

    app.use(
        cors({
            origin: process.env.CLIENT_URL || "http://localhost:3000",
            credentials: true,
        })
    );

    // Initialize queue processors before starting server
    // await initializeQueues();

    // WhatsApp webhook
    app.post("/webhooks/whatsapp", whatsappWebhook);

    app.get("/auth/callback", async (_req, res) => {
        // Just redirect to frontend callback page
        res.redirect(`${process.env.CLIENT_URL}/auth/callback`);
    });

    // Endpoint for the supabase for the cron job if we want to handle it with the trigger based sql fron DB itself 
    app.post("/cron/send-events", async (req: Request, res: Response) => {
        const configuredCronSecret = process.env.CRON_SECRET;

        if (
            !configuredCronSecret ||
            req.headers["x-cron-secret"] !== configuredCronSecret
        ) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const jobIds = await sendTodayEventMessages();

            res.json({
                message: "Event messages queued successfully",
                jobsQueued: jobIds.length,
                jobIds,
            });
        } catch (error) {
            console.error("Error queueing messages:", error);

            res.status(500).json({
                error: "Failed to queue messages",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    // Main endpoint
    app.get('/', async (req: Request, res: Response) => {
        res.json({ message: "Sucessfully server is running" })
    })

    // health check for deployment
    app.get("/health", (_req, res) => {
        res.status(200).send("OK");
    });

    // Queue Metrics Endpoint
    app.get('/api/queue/metrics', async (_req: Request, res: Response) => {
        try {
            const metrics = await getQueueMetrics();
            res.json({
                status: 'OK',
                metrics,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            res.status(500).json({
                error: 'Failed to fetch metrics',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    })

    // Dead Letter Queue Endpoint
    app.get('/api/queue/dlq', async (req: Request, res: Response) => {
        try {
            const limit = parseInt(req.query.limit as string) || 50;
            const dlqJobs = await getDLQJobs(limit);
            res.json({
                status: 'OK',
                dlqJobCount: dlqJobs.length,
                dlqJobs,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            res.status(500).json({
                error: 'Failed to fetch DLQ jobs',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    })

    // Health check endpoint
    app.get('/api/health', async (_req: Request, res: Response) => {
        try {
            const metrics = await getQueueMetrics();
            const isHealthy =
                metrics.generation.failed < 100 &&
                metrics.sending.failed < 100 &&
                metrics.dlq.total < 500;

            res.status(isHealthy ? 200 : 503).json({
                status: isHealthy ? 'HEALTHY' : 'DEGRADED',
                metrics,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            res.status(503).json({
                status: 'UNHEALTHY',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    })

    const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Queue Metrics: http://localhost:${PORT}/api/queue/metrics`);
        console.log(`DLQ Status: http://localhost:${PORT}/api/queue/dlq`);
        console.log(`Health Check: http://localhost:${PORT}/api/health`);
    });

    // initialize queues AFTER server starts
    initializeQueues()
        .then(() => {
            console.log("[Queues] All processors initialized successfully");
        })
        .catch((err) => {
            console.error("[Queues] Failed to initialize:", err);
        });

    try {
        const gqlServer = await createGraphqlApolloServer();
        app.use("/graphql", expressMiddleware(gqlServer, {
            context: createContext
        }));
    } catch (error) {
        console.error("[Server] Failed to initialize GraphQL server:", error);
        process.exit(1);  // Force failure to surface in logs
    }

    // Graceful shutdown
    process.on("SIGTERM", async () => {
        console.log("[Server] SIGTERM received, shutting down gracefully...");
        server.close(async () => {
            await closeQueues();
            process.exit(0);
        });
    });

    process.on("SIGINT", async () => {
        console.log("[Server] SIGINT received, shutting down gracefully...");
        server.close(async () => {
            await closeQueues();
            process.exit(0);
        });
    });
}

init()



// for local host we have to set this url in twilio When a message comes in
// https://hanna-unprovoked-nonexpressively.ngrok-free.dev/webhooks/whatsapp