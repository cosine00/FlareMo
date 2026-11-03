CREATE TABLE `insight_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`perspective` text,
	`perspective_label` text,
	`range` text NOT NULL,
	`tag` text,
	`sources` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `insight_reports_user_created_idx` ON `insight_reports` (`user_id`,`created_at`);