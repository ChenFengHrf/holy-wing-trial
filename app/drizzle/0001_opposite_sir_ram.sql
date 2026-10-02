ALTER TABLE `presence` ADD `ip_masked` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `presence` ADD `country_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `presence` ADD `region` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `presence` ADD `city` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `presence` ADD `network` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `presence` ADD `location_source` text DEFAULT '' NOT NULL;