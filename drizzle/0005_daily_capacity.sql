ALTER TABLE "team_members" ADD COLUMN "daily_capacity_hours" numeric(4, 1);--> statement-breakpoint
UPDATE "team_members" SET "daily_capacity_hours" = ROUND("weekly_capacity_hours" / 5, 1);--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "daily_capacity_hours" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "daily_capacity_hours" SET DEFAULT '8';--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN "weekly_capacity_hours";
