import { GraphQLClient } from "graphql-request";
import { GRAPHQL_ENDPOINT, INDEX_DATA_FILE_PATH } from "./constants";
import { getSdk } from "./generated/graphql";
import { formatRawNft, saveCollectionData, updateRarityScores } from "./utils";
import { storeNfts, getCollections } from "./db/utils";

const gqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);
const sdk = getSdk(gqlClient);

async function cleanupIndexData(indexData: indexData) {
    // Get already indexed collections from the database
    const existingCollections = await getCollections();
    const indexedTypes = new Set(existingCollections.map(c => c.type));

    indexData.to_index = [...new Set(indexData.to_index)]
        .filter(type => type !== indexData.currently_indexing)
        .filter(type => !indexedTypes.has(type));
}

export async function indexNfts() {
    console.log('🔄 Poller started. Checking for indexing tasks...');

    async function poll() {
        const indexData = await getIndexData();

        await cleanupIndexData(indexData);

        // --- WHEN A COLLECTION IS ACTIVELY BEING INDEXED --- //
        if (indexData.currently_indexing) {
            let hasNextPage = true;
            let totalIndexedThisRun = 0;
            console.log(`▶️ Resuming indexing for: ${indexData.currently_indexing}`);

            while (hasNextPage) {
                let startTime = performance.now();

                const { objects } = await sdk.GetNftsByType({
                    nftType: indexData.currently_indexing,
                    first: 50,
                    after: indexData.last_cursor ?? undefined,
                });

                if (!objects?.nodes) {
                    console.error("❌ No objects found for type", indexData.currently_indexing);
                    break;
                }

                hasNextPage = objects.pageInfo.hasNextPage;
                indexData.last_cursor = objects.pageInfo.endCursor ?? null;

                // Save progress after every batch
                await storeIndexData(indexData);

                const nftsToStore = objects.nodes
                    .map(node => formatRawNft({ nftNode: node, collectionType: indexData.currently_indexing }))
                    .filter((nft): nft is NonNullable<typeof nft> => nft !== null);

                if (nftsToStore.length > 0) {
                    await storeNfts(nftsToStore);

                    totalIndexedThisRun += nftsToStore.length;
                    console.log(`✅ Indexed ${nftsToStore.length} NFTs (Total this run: ${totalIndexedThisRun})`);
                } else {
                    console.log('⚠️ No valid NFTs found in this batch');
                }

                const endTime = performance.now();
                const duration = endTime - startTime;
                console.log(`🕒 Batch took ${Math.round(duration)} ms`);

                // --- WHEN THE CURRENT COLLECTION IS FINISHED --- //
                if (!hasNextPage) {
                    console.log(`🎉 Collection finished: ${indexData.currently_indexing}`);
                    console.log(`🔄 Calculating rarity scores...`);

                    await updateRarityScores(indexData.currently_indexing);
                    console.log(`✅ Rarity scores calculated.`);

                    console.log(`🔄 Saving collection to database...`);
                    await saveCollectionData({
                        type: indexData.currently_indexing,
                        totalSupply: totalIndexedThisRun,
                    });

                    // Clear the current task - the collection is now in the database
                    indexData.currently_indexing = "";
                    indexData.last_cursor = null;

                    // Get updated count from database
                    const totalCollections = await getCollections();
                    console.log(`📊 Collection added to database. Total indexed collections: ${totalCollections.length}`);

                    // No need to save here, as the next block will handle the state update.
                    break; // Exit the while loop
                }
            }
        }

        // --- LOGIC TO PICK THE NEXT COLLECTION FROM THE QUEUE ---
        // This runs if nothing is currently being indexed (either initially, or after one just finished).
        if (!indexData.currently_indexing && indexData.to_index.length > 0) {
            console.log('📋 Picking next collection from the queue...');

            // Take the first item from the "to-do" list
            const nextCollection = indexData.to_index.shift(); // .shift() removes and returns the first element

            if (nextCollection) {
                indexData.currently_indexing = nextCollection;
                indexData.last_cursor = null; // Ensure we start from the beginning
                console.log(`🚀 Now indexing: ${nextCollection}`);
            }
        } else if (!indexData.currently_indexing) {
            console.log('... Poller is idle. No new collections in the queue.');
        }

        await storeIndexData(indexData);

        // Only continue polling if there's work to do
        if (indexData.currently_indexing || indexData.to_index.length > 0) {
            setTimeout(poll, 100); // Check again almost immediately
        } else {
            console.log('🎯 All indexing tasks completed. Poller stopped.');
        }
    }

    poll();
}


async function storeIndexData(data: indexData) {
    try {
        await Bun.write(INDEX_DATA_FILE_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ Error storing index data:', error);
    }
}

async function getIndexData() {
    // NOTE: Make sure your types.d.ts file defines the 'indexData' type
    return await Bun.file(INDEX_DATA_FILE_PATH).json() as indexData;
}