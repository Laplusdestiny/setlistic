CREATE TABLE "custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"field_type" text NOT NULL,
	"options" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"show_in_list" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "custom_fields_user_name_unique" UNIQUE("user_id","name"),
	CONSTRAINT "custom_fields_type_check" CHECK ("custom_fields"."field_type" in ('text','number','select','multi_select','date','checkbox'))
);
--> statement-breakpoint
ALTER TABLE "custom_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"conditions" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sing_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"sung_at" date DEFAULT current_date NOT NULL,
	"ease" smallint,
	"note" text,
	CONSTRAINT "sing_logs_ease_check" CHECK ("sing_logs"."ease" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "sing_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_field_values" (
	"song_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "song_field_values_song_id_field_id_pk" PRIMARY KEY("song_id","field_id")
);
--> statement-breakpoint
ALTER TABLE "song_field_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_tags" (
	"song_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "song_tags_song_id_tag_id_pk" PRIMARY KEY("song_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "song_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"apple_track_id" bigint,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"genre" text,
	"artwork_url" text,
	"duration_ms" integer,
	"release_date" date,
	"apple_url" text,
	"source_service" text,
	"source_url" text,
	"song_key" smallint,
	"memo" text,
	"last_sung_at" date,
	"sung_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_user_apple_track_unique" UNIQUE("user_id","apple_track_id"),
	CONSTRAINT "songs_source_service_check" CHECK ("songs"."source_service" in ('apple_music','spotify','youtube_music','amazon_music','manual','search')),
	CONSTRAINT "songs_song_key_check" CHECK ("songs"."song_key" between -7 and 7)
);
--> statement-breakpoint
ALTER TABLE "songs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tag_aliases" (
	"tag_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	CONSTRAINT "tag_aliases_tag_id_normalized_alias_pk" PRIMARY KEY("tag_id","normalized_alias")
);
--> statement-breakpoint
ALTER TABLE "tag_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tag_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tag_groups_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "tag_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_user_normalized_name_unique" UNIQUE("user_id","normalized_name")
);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"list_sort" text DEFAULT 'created_desc' NOT NULL,
	"list_columns" jsonb DEFAULT '["key","tags"]'::jsonb NOT NULL,
	"default_tag_ids" uuid[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sing_logs" ADD CONSTRAINT "sing_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sing_logs" ADD CONSTRAINT "sing_logs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_field_values" ADD CONSTRAINT "song_field_values_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_field_values" ADD CONSTRAINT "song_field_values_field_id_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_field_values" ADD CONSTRAINT "song_field_values_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_tags" ADD CONSTRAINT "song_tags_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_tags" ADD CONSTRAINT "song_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_tags" ADD CONSTRAINT "song_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_aliases" ADD CONSTRAINT "tag_aliases_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_aliases" ADD CONSTRAINT "tag_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_groups" ADD CONSTRAINT "tag_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_group_id_tag_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tag_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sing_logs_song_idx" ON "sing_logs" USING btree ("song_id","sung_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "song_tags_tag_idx" ON "song_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "songs_user_created_idx" ON "songs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "songs_user_last_sung_idx" ON "songs" USING btree ("user_id","last_sung_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tags_group_idx" ON "tags" USING btree ("group_id");--> statement-breakpoint
CREATE POLICY "custom_fields_own_rows" ON "custom_fields" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);--> statement-breakpoint
CREATE POLICY "saved_searches_own_rows" ON "saved_searches" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);--> statement-breakpoint
CREATE POLICY "sing_logs_own_rows" ON "sing_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "sing_logs"."user_id") WITH CHECK ((select auth.uid()) = "sing_logs"."user_id" and exists (select 1 from songs r where r.id = "sing_logs"."song_id" and r.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "song_field_values_own_rows" ON "song_field_values" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "song_field_values"."user_id") WITH CHECK ((select auth.uid()) = "song_field_values"."user_id"
        and exists (select 1 from songs r where r.id = "song_field_values"."song_id" and r.user_id = (select auth.uid()))
        and exists (select 1 from custom_fields r where r.id = "song_field_values"."field_id" and r.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "song_tags_own_rows" ON "song_tags" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "song_tags"."user_id") WITH CHECK ((select auth.uid()) = "song_tags"."user_id"
        and exists (select 1 from songs r where r.id = "song_tags"."song_id" and r.user_id = (select auth.uid()))
        and exists (select 1 from tags r where r.id = "song_tags"."tag_id" and r.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "songs_own_rows" ON "songs" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);--> statement-breakpoint
CREATE POLICY "tag_aliases_own_rows" ON "tag_aliases" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "tag_aliases"."user_id") WITH CHECK ((select auth.uid()) = "tag_aliases"."user_id" and exists (select 1 from tags r where r.id = "tag_aliases"."tag_id" and r.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "tag_groups_own_rows" ON "tag_groups" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);--> statement-breakpoint
CREATE POLICY "tags_own_rows" ON "tags" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);--> statement-breakpoint
CREATE POLICY "user_settings_own_rows" ON "user_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);