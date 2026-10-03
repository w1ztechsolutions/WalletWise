ALTER TABLE `accounts` RENAME COLUMN "balance" TO "opening_balance";--> statement-breakpoint
ALTER TABLE `transactions` ADD `account_id` text REFERENCES accounts(id) ON DELETE SET NULL;