CREATE TYPE "public"."input_type" AS ENUM('pdf', 'image', 'audio', 'email', 'text');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"unit" varchar(50) DEFAULT 'each',
	"default_rate" numeric(12, 2) DEFAULT '0.00',
	"cost_price" numeric(12, 2),
	"is_active" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_estimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"notes" text,
	"cost_breakdown" json,
	"time_estimates" json,
	"risk_notes" text,
	"ai_suggestions" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "internal_estimates_quote_id_unique" UNIQUE("quote_id")
);
--> statement-breakpoint
CREATE TABLE "quote_inputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"input_type" "input_type" NOT NULL,
	"filename" varchar(255),
	"file_url" text,
	"file_key" varchar(255),
	"content" text,
	"mime_type" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0,
	"description" text NOT NULL,
	"quantity" numeric(12, 4) DEFAULT '1.0000',
	"unit" varchar(50) DEFAULT 'each',
	"rate" numeric(12, 2) DEFAULT '0.00',
	"total" numeric(12, 2) DEFAULT '0.00',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"reference" varchar(100),
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"client_name" varchar(255),
	"client_email" varchar(320),
	"client_phone" varchar(50),
	"client_address" text,
	"title" varchar(255),
	"description" text,
	"terms" text,
	"valid_until" timestamp,
	"subtotal" numeric(12, 2) DEFAULT '0.00',
	"tax_rate" numeric(5, 2) DEFAULT '0.00',
	"tax_amount" numeric(12, 2) DEFAULT '0.00',
	"total" numeric(12, 2) DEFAULT '0.00',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"accepted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tender_contexts" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"symbol_mappings" json,
	"assumptions" json,
	"exclusions" json,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tender_contexts_quote_id_unique" UNIQUE("quote_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"role" "role" DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"company_name" varchar(255),
	"company_address" text,
	"company_phone" varchar(50),
	"company_email" varchar(320),
	"default_terms" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
