-- Rollback: DROP INDEX IF EXISTS `memos_visibility_pinned_created_id_idx`;
CREATE INDEX `memos_visibility_pinned_created_id_idx` ON `memos` (`visibility`,`pinned`,`created_at`,`id`);--> statement-breakpoint
