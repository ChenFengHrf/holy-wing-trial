CREATE TABLE `admin_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_expires` ON `admin_sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `presence` (
	`visitor` text NOT NULL,
	`session` text NOT NULL,
	`name` text NOT NULL,
	`hero` text NOT NULL,
	`mode` text NOT NULL,
	`score` integer NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`visitor`, `session`)
);
--> statement-breakpoint
CREATE INDEX `idx_presence_last_seen` ON `presence` (`last_seen`);