-- Two timeline indexes: one for the public branch of the read scope and one
-- for the team branch. Both repeat the list ORDER BY after the equality
-- column so the planner stops after the page window instead of sorting the
-- whole corpus.
--
-- Rollback:
--   DROP INDEX IF EXISTS `memos_visibility_pinned_created_id_idx`;
--   DROP INDEX IF EXISTS `memos_team_pinned_created_id_idx`;
CREATE INDEX `memos_visibility_pinned_created_id_idx` ON `memos` (`visibility`,`pinned`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `memos_team_pinned_created_id_idx` ON `memos` (`team_id`,`pinned`,`created_at`,`id`);