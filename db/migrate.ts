import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from ".";

const isDev = process.env.NODE_ENV === "development";

export async function migrateDatabase() {
    console.log("migrating database...");

    migrate(db, { migrationsFolder: "./drizzle" });

    console.log("✅ database migrated successfully");
}

if (isDev && Bun.main.endsWith('migrate.ts')) {
    migrateDatabase();
}