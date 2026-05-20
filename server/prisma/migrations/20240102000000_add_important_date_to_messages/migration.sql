-- AlterTable
ALTER TABLE "Messages" ADD COLUMN "important_date_id" UUID;

-- AddForeignKey
ALTER TABLE "Messages" ADD CONSTRAINT "Messages_important_date_id_fkey" FOREIGN KEY ("important_date_id") REFERENCES "Important_Dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
