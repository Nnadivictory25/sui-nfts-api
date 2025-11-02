CREATE TABLE `collections` (
	`type` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`total_supply` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_collections_type` ON `collections` (`type`);--> statement-breakpoint
CREATE TABLE `nfts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`rarity` integer,
	`image_url` text NOT NULL,
	`attributes` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_nfts_type` ON `nfts` (`type`);