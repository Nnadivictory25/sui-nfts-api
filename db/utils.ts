import { db } from ".";
import { collections, nfts, type NewCollection, type NewNft } from "./schema";
import { eq } from "drizzle-orm";

export async function storeNfts(newNfts: NewNft[]) {
    await db.insert(nfts).values(newNfts).onConflictDoNothing();
}

export async function getNftsByType(type: string) {
    return await db.select().from(nfts).where(eq(nfts.type, type));
}

export async function getNftById(id: string) {
    return await db.select().from(nfts).where(eq(nfts.id, id))
}

export async function storeCollections(newCollections: NewCollection[]) {
    await db.insert(collections).values(newCollections).onConflictDoNothing();
}

export async function getCollections() {
    return await db.select().from(collections);
}

export async function getCollectionByType(type: string) {
    return await db.select().from(collections).where(eq(collections.type, type));
}

export async function updateRarityScoreInDB(data: RarityScore[]) {
    const st = performance.now();
    await db.transaction(async (tx) => {
        for (const { id: nftId, score } of data) {
            await tx.update(nfts).set({ rarity: score }).where(eq(nfts.id, nftId))
        }
    });
    const et = performance.now();
    console.log(`🕒 Rarity score update took ${Math.round(et - st)} ms`);
}

export async function saveCollectionInDB(collection: NewCollection) {
    await db.insert(collections).values(collection).onConflictDoNothing();
}