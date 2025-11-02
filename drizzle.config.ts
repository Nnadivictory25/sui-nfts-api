import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: 'sqlite', // 'mysql' | 'sqlite' | 'turso'
    schema: './db/schema.ts',
    dbCredentials: {
        url: 'nfts.db',
    },
})
