CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by_id` text NOT NULL,
	`from_account_id` text,
	`to_account_id` text,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`notes` text,
	`created_date` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_date` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
