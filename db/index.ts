import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const isDev = process.env.NODE_ENV === "development";
const path = isDev ? 'nfts.db' : '/data/nfts.db';

if (!isDev) {
    // Create directory if it doesn't exist
    const dir = dirname(path);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

const sqlite = new Database(path, { create: true });
export const db = drizzle({ client: sqlite });