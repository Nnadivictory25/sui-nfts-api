import { name, sql } from "drizzle-orm";
import { sqliteTable, integer, text, customType, index } from "drizzle-orm/sqlite-core"

const jsonArray = <TData>(name: string) =>
    customType<{ data: TData[]; driverData: string }>({
        dataType() {
            return 'text';
        },
        toDriver(value: TData[]): string {
            return JSON.stringify(value);
        },
        fromDriver(value: string): TData[] {
            return JSON.parse(value);
        },
    })(name);

const timestamps = {
    created_at: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => sql`CURRENT_TIMESTAMP`),
}


export const nfts = sqliteTable('nfts', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    rarity: integer('rarity'),
    imageUrl: text('image_url').notNull(),
    attributes: jsonArray<attribute>('attributes').notNull(),
    ...timestamps,
},
    (table) => [
        index('idx_nfts_type').on(table.type),
    ]);


export type Nft = typeof nfts.$inferSelect;
export type NewNft = typeof nfts.$inferInsert;

export const collections = sqliteTable('collections', {
    type: text('type').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    totalSupply: integer('total_supply').notNull(),
    ...timestamps,
},
    (table) => [
        index('idx_collections_type').on(table.type),
    ]);

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;