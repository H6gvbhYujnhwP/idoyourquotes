CREATE TABLE `catalogItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(100),
	`unit` varchar(50) DEFAULT 'each',
	`defaultRate` decimal(12,2) DEFAULT '0.00',
	`costPrice` decimal(12,2),
	`isActive` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `catalogItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `internalEstimates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`notes` text,
	`costBreakdown` json,
	`timeEstimates` json,
	`riskNotes` text,
	`aiSuggestions` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `internalEstimates_id` PRIMARY KEY(`id`),
	CONSTRAINT `internalEstimates_quoteId_unique` UNIQUE(`quoteId`)
);
--> statement-breakpoint
CREATE TABLE `quoteInputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`inputType` enum('pdf','image','audio','email','text') NOT NULL,
	`filename` varchar(255),
	`fileUrl` text,
	`fileKey` varchar(255),
	`content` text,
	`mimeType` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quoteInputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quoteLineItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`sortOrder` int DEFAULT 0,
	`description` text NOT NULL,
	`quantity` decimal(12,4) DEFAULT '1.0000',
	`unit` varchar(50) DEFAULT 'each',
	`rate` decimal(12,2) DEFAULT '0.00',
	`total` decimal(12,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quoteLineItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`reference` varchar(100),
	`status` enum('draft','sent','accepted','declined') NOT NULL DEFAULT 'draft',
	`clientName` varchar(255),
	`clientEmail` varchar(320),
	`clientPhone` varchar(50),
	`clientAddress` text,
	`title` varchar(255),
	`description` text,
	`terms` text,
	`validUntil` timestamp,
	`subtotal` decimal(12,2) DEFAULT '0.00',
	`taxRate` decimal(5,2) DEFAULT '0.00',
	`taxAmount` decimal(12,2) DEFAULT '0.00',
	`total` decimal(12,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`sentAt` timestamp,
	`acceptedAt` timestamp,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenderContexts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`symbolMappings` json,
	`assumptions` json,
	`exclusions` json,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenderContexts_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenderContexts_quoteId_unique` UNIQUE(`quoteId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `companyName` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `companyAddress` text;--> statement-breakpoint
ALTER TABLE `users` ADD `companyPhone` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `companyEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD `defaultTerms` text;