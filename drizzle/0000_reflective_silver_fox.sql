CREATE TABLE `catalog_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`org_id` int,
	`user_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(100),
	`unit` varchar(50) DEFAULT 'each',
	`default_rate` decimal(12,2) DEFAULT '0.00',
	`cost_price` decimal(12,2),
	`is_active` int DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalog_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `internal_estimates` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`quote_id` int NOT NULL,
	`notes` text,
	`cost_breakdown` json,
	`time_estimates` json,
	`risk_notes` text,
	`ai_suggestions` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `internal_estimates_id` PRIMARY KEY(`id`),
	CONSTRAINT `internal_estimates_quote_id_unique` UNIQUE(`quote_id`)
);
--> statement-breakpoint
CREATE TABLE `org_members` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`invited_at` timestamp NOT NULL DEFAULT (now()),
	`accepted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `org_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`company_name` varchar(255),
	`company_address` text,
	`company_phone` varchar(50),
	`company_email` varchar(320),
	`company_logo` text,
	`default_terms` text,
	`billing_email` varchar(320),
	`stripe_customer_id` varchar(255),
	`ai_credits_remaining` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `quote_inputs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`quote_id` int NOT NULL,
	`input_type` enum('pdf','image','audio','email','text') NOT NULL,
	`filename` varchar(255),
	`file_url` text,
	`file_key` varchar(255),
	`content` text,
	`mime_type` varchar(100),
	`processed_content` text,
	`processing_status` varchar(20) DEFAULT 'pending',
	`processing_error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quote_inputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_line_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`quote_id` int NOT NULL,
	`sort_order` int DEFAULT 0,
	`description` text NOT NULL,
	`quantity` decimal(12,4) DEFAULT '1.0000',
	`unit` varchar(50) DEFAULT 'each',
	`rate` decimal(12,2) DEFAULT '0.00',
	`total` decimal(12,2) DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quote_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`org_id` int,
	`user_id` int NOT NULL,
	`created_by_user_id` int,
	`reference` varchar(100),
	`status` enum('draft','sent','accepted','declined') NOT NULL DEFAULT 'draft',
	`client_name` varchar(255),
	`client_email` varchar(320),
	`client_phone` varchar(50),
	`client_address` text,
	`title` varchar(255),
	`description` text,
	`terms` text,
	`valid_until` timestamp,
	`subtotal` decimal(12,2) DEFAULT '0.00',
	`tax_rate` decimal(5,2) DEFAULT '0.00',
	`tax_amount` decimal(12,2) DEFAULT '0.00',
	`total` decimal(12,2) DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`sent_at` timestamp,
	`accepted_at` timestamp,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tender_contexts` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`quote_id` int NOT NULL,
	`symbol_mappings` json,
	`assumptions` json,
	`exclusions` json,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tender_contexts_id` PRIMARY KEY(`id`),
	CONSTRAINT `tender_contexts_quote_id_unique` UNIQUE(`quote_id`)
);
--> statement-breakpoint
CREATE TABLE `usage_logs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`user_id` int NOT NULL,
	`action_type` varchar(50) NOT NULL,
	`credits_used` int NOT NULL DEFAULT 1,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usage_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`is_active` boolean NOT NULL DEFAULT true,
	`company_name` varchar(255),
	`company_address` text,
	`company_phone` varchar(50),
	`company_email` varchar(320),
	`default_terms` text,
	`company_logo` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`last_signed_in` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
