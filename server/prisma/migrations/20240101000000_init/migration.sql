-- CreateEnum
CREATE TYPE "ConversationStep" AS ENUM ('NONE', 'ASK_PERSON_NAME', 'ASK_PERSON_PHONE', 'ASK_PERSON_RELATION', 'ASK_PERSON_DATE', 'ASK_EVENT_TYPE', 'ASK_EVENT_DATE', 'ASK_AI_TONE', 'CONFIRM_PERSON');

-- CreateEnum
CREATE TYPE "ConversationFlow" AS ENUM ('NONE', 'ADD_PERSON');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('NEW', 'ASK_NAME', 'READY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "whatsapp_number" TEXT,
    "full_name" TEXT,
    "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'NEW',
    "conversationFlow" "ConversationFlow" NOT NULL DEFAULT 'NONE',
    "conversationStep" "ConversationStep" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "People" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "phone_number" TEXT,
    "ai_tone_preference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "user_id" UUID NOT NULL,

    CONSTRAINT "People_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Important_Dates" (
    "id" UUID NOT NULL,
    "date_value" DATE NOT NULL,
    "dateType" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "person_id" UUID NOT NULL,

    CONSTRAINT "Important_Dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User_Preferences" (
    "id" UUID NOT NULL,
    "time_zone" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "email_notifications" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,

    CONSTRAINT "User_Preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Whatsapp_Config" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "access_token" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,

    CONSTRAINT "Whatsapp_Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Messages" (
    "id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message_length" INTEGER NOT NULL,
    "person_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "Messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_whatsapp_number_key" ON "users"("whatsapp_number");

-- CreateIndex
CREATE UNIQUE INDEX "People_user_id_phone_number_key" ON "People"("user_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "Important_Dates_person_id_dateType_key" ON "Important_Dates"("person_id", "dateType");

-- AddForeignKey
ALTER TABLE "People" ADD CONSTRAINT "People_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Important_Dates" ADD CONSTRAINT "Important_Dates_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "People"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User_Preferences" ADD CONSTRAINT "User_Preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Whatsapp_Config" ADD CONSTRAINT "Whatsapp_Config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Messages" ADD CONSTRAINT "Messages_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "People"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Messages" ADD CONSTRAINT "Messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
