import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
const isDev = process.env.NODE_ENV === "development";
const path = isDev ? 'nfts.db' : '/data/nfts.db';
const sqlite = new Database(path, { create: true });
export const db = drizzle({ client: sqlite });