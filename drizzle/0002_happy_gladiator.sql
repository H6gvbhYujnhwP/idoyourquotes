ALTER TABLE "quote_inputs" ADD COLUMN "processed_content" text;--> statement-breakpoint
ALTER TABLE "quote_inputs" ADD COLUMN "processing_status" varchar(20) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "quote_inputs" ADD COLUMN "processing_error" text;