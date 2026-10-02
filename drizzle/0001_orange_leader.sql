ALTER TABLE `transactions` ADD `attachment_key` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `attachment_name` text;--> statement-breakpoint
ALTER TABLE `user` ADD `currency` text DEFAULT 'MWK' NOT NULL;