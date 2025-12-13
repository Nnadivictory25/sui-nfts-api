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
    return await db.select({
        id: nfts.id,
        name: nfts.name,
        type: nfts.type,
        rank: nfts.rank,
        imageUrl: nfts.imageUrl,
        attributes: nfts.attributes
    }).from(nfts).where(eq(nfts.id, id))
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

export async function deleteCollectionByType(type: string) {
    await db.delete(collections).where(eq(collections.type, type));
    await db.delete(nfts).where(eq(nfts.type, type));
}

export async function updateRarityScoreInDB(data: RarityScore[]) {
    const st = performance.now();
    await db.transaction(async (tx) => {
        for (const { id: nftId, score } of data) {
            await tx.update(nfts).set({ rank: score }).where(eq(nfts.id, nftId))
        }
    });
    const et = performance.now();
    console.log(`🕒 Rarity score update took ${Math.round(et - st)} ms`);
}

export async function saveCollectionInDB(collection: NewCollection) {
    await db.insert(collections).values(collection).onConflictDoNothing();
}

// Index endpoint utilities

export async function checkNftTypeStatus(nftType: string): Promise<{
    status: 'available' | 'already_indexed' | 'queued' | 'currently_indexing';
    message: string;
}> {
    // Check if already indexed in database
    const existingCollections = await getCollections();
    const isAlreadyIndexed = existingCollections.some(c => c.type === nftType);

    if (isAlreadyIndexed) {
        return {
            status: 'already_indexed',
            message: "NFT type is already indexed"
        };
    }

    // Read current index data
    const indexData = await Bun.file('./data/index-data.json').json();

    // Check if already in queue or currently indexing
    const isInQueue = indexData.to_index.includes(nftType);
    const isCurrentlyIndexing = indexData.currently_indexing === nftType;

    if (isCurrentlyIndexing) {
        return {
            status: 'currently_indexing',
            message: "NFT type is currently being indexed"
        };
    }

    if (isInQueue) {
        return {
            status: 'queued',
            message: "NFT type is already in indexing queue"
        };
    }

    return {
        status: 'available',
        message: "NFT type is available for indexing"
    };
}

export async function addNftTypeToIndex(nftType: string): Promise<{ success: boolean; queuePosition?: number; error?: string }> {
    try {
        // Read current index data
        const indexData = await Bun.file('./data/index-data.json').json();

        // Add to queue
        indexData.to_index.push(nftType);

        // Write back to file
        await Bun.write('./data/index-data.json', JSON.stringify(indexData, null, 2));

        return {
            success: true,
            queuePosition: indexData.to_index.length
        };
    } catch (error) {
        console.error('Error adding NFT type to index:', error);
        return {
            success: false,
            error: "Failed to add NFT type to indexing queue"
        };
    }
}