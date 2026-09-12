CREATE TYPE "public"."ContextClassification" AS ENUM('public', 'team', 'private', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."ContextSourceType" AS ENUM('drive', 'slack', 'gmail');--> statement-breakpoint
CREATE TABLE "context_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"receiptId" text,
	"requesterId" text NOT NULL,
	"ownerId" text NOT NULL,
	"organizationId" text,
	"question" text NOT NULL,
	"shared" json NOT NULL,
	"redacted" json NOT NULL,
	"why" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_items" (
	"id" text PRIMARY KEY NOT NULL,
	"ownerId" text NOT NULL,
	"organizationId" text,
	"sourceType" "ContextSourceType" NOT NULL,
	"rawExcerpt" text NOT NULL,
	"structuredClaim" json NOT NULL,
	"classification" "ContextClassification" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "protected_conclusions" (
	"id" text PRIMARY KEY NOT NULL,
	"ownerId" text NOT NULL,
	"organizationId" text,
	"label" text NOT NULL,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_config" (
	"id" text PRIMARY KEY NOT NULL,
	"window_seconds" integer NOT NULL,
	"max_slots" integer NOT NULL,
	"retention_minutes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_slots" (
	"id" text NOT NULL,
	"slot_at" timestamp with time zone NOT NULL,
	"slot_id" text NOT NULL,
	CONSTRAINT "rate_limit_slots_id_slot_id_pk" PRIMARY KEY("id","slot_id")
);
--> statement-breakpoint
ALTER TABLE "context_audit_log" ADD CONSTRAINT "context_audit_log_requesterId_user_id_fk" FOREIGN KEY ("requesterId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_audit_log" ADD CONSTRAINT "context_audit_log_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_audit_log" ADD CONSTRAINT "context_audit_log_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_items" ADD CONSTRAINT "context_items_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_items" ADD CONSTRAINT "context_items_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_conclusions" ADD CONSTRAINT "protected_conclusions_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_conclusions" ADD CONSTRAINT "protected_conclusions_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "context_audit_log_requesterId_idx" ON "context_audit_log" USING btree ("requesterId");--> statement-breakpoint
CREATE INDEX "context_audit_log_ownerId_idx" ON "context_audit_log" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "context_audit_log_organizationId_idx" ON "context_audit_log" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "context_items_ownerId_idx" ON "context_items" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "context_items_organizationId_idx" ON "context_items" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "protected_conclusions_ownerId_idx" ON "protected_conclusions" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "protected_conclusions_organizationId_idx" ON "protected_conclusions" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "rate_limit_slots_window_idx" ON "rate_limit_slots" USING btree ("id","slot_at");