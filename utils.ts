import { sdk } from ".";
import { type NewNft } from "./db/schema";
import { getNftsByType, saveCollectionInDB, updateRarityScoreInDB } from "./db/utils";
import type { GetNftsByTypeQuery } from "./generated/graphql";

// Fix for possible undefined/null path on 'objects'
type NftNode =
    NonNullable<
        NonNullable<GetNftsByTypeQuery['objects']>['nodes']
    >[number];


export function formatRawNft({ nftNode, collectionType }: { nftNode: NftNode, collectionType: string }): NewNft | null {
    const addr = nftNode?.address;
    const nftJson = nftNode?.asMoveObject?.contents?.json;
    const displayOutput = nftNode?.asMoveObject?.contents?.display?.output;

    if (!nftJson && !displayOutput) {
        console.warn(`[NFT PARSE] Missing json and display data for ${addr}`);
        return null;
    }

    // For Prime Machin NFTs, the name and image_url are in display.output, not json
    let name: string | undefined;
    let imageUrl: string | undefined;

    if (displayOutput) {
        name = displayOutput.name;
        imageUrl = displayOutput.image_url;
    } else if (nftJson) {
        // Handle nested collectible structure
        if (nftJson.collectible) {
            name = nftJson.collectible.name;
            imageUrl = nftJson.collectible.image_url;
        } else {
            name = nftJson.name;
            imageUrl = nftJson.image_url;
        }
    }

    if (!name || !imageUrl) {
        console.warn(`[NFT PARSE] Invalid NFT fields for ${addr}`, {
            name,
            image_url: imageUrl,
            hasDisplay: !!displayOutput,
            hasJson: !!nftJson
        });
        return null;
    }

    let attributes: any[] = [];

    // Handle different possible attribute structures
    const attributeSource = nftJson?.collectible?.attributes || nftJson?.attributes;

    if (attributeSource) {
        if (Array.isArray(attributeSource)) {
            // Direct array
            attributes = attributeSource;
        } else if (attributeSource.contents && Array.isArray(attributeSource.contents)) {
            // Nested in contents
            attributes = attributeSource.contents;
        } else if (attributeSource.fields && Array.isArray(attributeSource.fields)) {
            // Nested in fields
            attributes = attributeSource.fields;
        } else if (attributeSource.map && attributeSource.map.contents && Array.isArray(attributeSource.map.contents)) {
            // Nested in map.contents
            attributes = attributeSource.map.contents;
        } else if (attributeSource.data && typeof attributeSource.data === 'object') {
            // Handle case where attributes are in a data object (like Prime Machin NFTs)
            const dataObj = attributeSource.data;
            attributes = Object.entries(dataObj).map(([key, value]) => ({ key, value }));
        } else {
            console.warn(`[NFT PARSE] Unknown attributes structure for ${addr}:`, attributeSource);
        }
    }

    // Filter and validate attributes
    const validAttributes = attributes.filter((a: any) => {
        if (!a) return false;

        // Handle different attribute structures
        let key, value;
        if (typeof a.key === 'string' && typeof a.value === 'string') {
            key = a.key;
            value = a.value;
        } else if (a.fields && typeof a.fields.key === 'string' && typeof a.fields.value === 'string') {
            key = a.fields.key;
            value = a.fields.value;
        } else if (Array.isArray(a) && a.length >= 2) {
            // Sometimes attributes come as [key, value] arrays
            key = a[0];
            value = a[1];
        } else {
            console.warn(`[NFT PARSE] Invalid attribute structure for ${addr}:`, a);
            return false;
        }

        return typeof key === 'string' && typeof value === 'string' && key.trim() !== '' && value.trim() !== '';
    }).map((a: any) => {
        // Normalize attribute structure
        if (typeof a.key === 'string' && typeof a.value === 'string') {
            return { key: a.key, value: a.value };
        } else if (a.fields && typeof a.fields.key === 'string' && typeof a.fields.value === 'string') {
            return { key: a.fields.key, value: a.fields.value };
        } else if (Array.isArray(a) && a.length >= 2) {
            return { key: a[0], value: a[1] };
        }
        return null;
    }).filter(Boolean);

    return {
        id: addr,
        name: name,
        type: collectionType,
        imageUrl: imageUrl,
        attributes: validAttributes.filter((a): a is attribute => a !== null && a !== undefined),
    };
}

export async function updateRarityScores(nftType: string) {
    console.log('📊 Starting rarity score calculation...');

    try {
        const allNfts = await getNftsByType(nftType);
        const totalNfts = allNfts.length;

        // Debug: Check if NFTs have attributes
        const nftsWithAttributes = allNfts.filter(nft => nft.attributes && nft.attributes.length > 0);
        console.log(`📊 Found ${totalNfts} total NFTs, ${nftsWithAttributes.length} have attributes`);

        if (nftsWithAttributes.length === 0) {
            console.warn('⚠️ No NFTs found with attributes. Cannot calculate rarity scores.');
            return;
        }

        const traitCounts = new Map<string, Map<string, number>>();

        // 1. Count trait occurrences
        for (const nft of allNfts) {
            if (!nft.attributes || nft.attributes.length === 0) {
                console.warn(`[RARITY] NFT ${nft.id} has no attributes`);
                continue;
            }

            for (const attr of nft.attributes) {
                if (!attr || !attr.key || !attr.value) {
                    console.warn(`[RARITY] Invalid attribute for NFT ${nft.id}:`, attr);
                    continue;
                }

                const traitType = attr.key;
                const traitValue = attr.value;

                if (!traitCounts.has(traitType)) {
                    traitCounts.set(traitType, new Map<string, number>());
                }
                const values = traitCounts.get(traitType)!;
                values.set(traitValue, (values.get(traitValue) || 0) + 1);
            }
        }

        // 2. Calculate rarity scores for each NFT
        const rarityScoresWithFloat = allNfts.map(nft => {
            let totalRarityScore = 0;
            let attributeCount = 0;

            if (nft.attributes && nft.attributes.length > 0) {
                for (const attr of nft.attributes) {
                    if (!attr || !attr.key || !attr.value) continue;

                    const traitType = attr.key;
                    const traitValue = attr.value;
                    const count = traitCounts.get(traitType)?.get(traitValue);

                    if (count) {
                        const traitRarityScore = 1 / (count / totalNfts);
                        totalRarityScore += traitRarityScore;
                        attributeCount++;
                    }
                }
            }

            // If NFT has no valid attributes, give it a low rarity score
            if (attributeCount === 0) {
                totalRarityScore = 0.001; // Very low score for NFTs without attributes
            }

            return {
                id: nft.id,
                rarityScore: totalRarityScore,
                attributeCount
            };
        });

        // 3. Sort by the calculated float score to determine the rank
        rarityScoresWithFloat.sort((a, b) => b.rarityScore - a.rarityScore);

        // 4. Create the final rarity scores using the rank
        const rarityScores: RarityScore[] = rarityScoresWithFloat.map((score, index) => ({
            id: score.id,
            score: index + 1,
        }));

        // 5. Store the rarity scores in the database using the existing function
        console.log('💾 Updating rarity scores in database...');
        await updateRarityScoreInDB(rarityScores);
        console.log(`✅ Rarity scores updated in database for ${rarityScores.length} NFTs`);

        // 6. Display the results
        console.log("\n🏆 NFT Rarity Ranking (Top 10):");
        rarityScores.slice(0, 5).forEach((score) => {
            const nftData = rarityScoresWithFloat.find(r => r.id === score.id);
            console.log(
                `Rank ${score.score}: ${score.id} (${nftData?.attributeCount || 0} attributes, score: ${nftData?.rarityScore.toFixed(2) || 'N/A'})`
            );
        });
    } catch (error) {
        console.error('❌ Error updating rarity scores:', error);
    }
}


export function parseNftName(name?: string | null): string {
    if (!name) {
        return "";
    }
    return name.replace(/\s*#?\d+$/, '').trim();
}


export async function getRawOnchainNftData(type: string) {
    console.log(`[COLLECTION PARSE] Fetching onchain data for type: ${type}`);

    try {
        const { objects } = await sdk.GetNftsByType({
            nftType: type,
            first: 1,
            after: null,
        });

        const nftNode = objects?.nodes?.[0] as NftNode;
        if (!nftNode) {
            console.warn(`[COLLECTION PARSE] No NFT nodes found for type: ${type}`);
            return null;
        }

        const nftJson = nftNode?.asMoveObject?.contents?.json;
        if (!nftJson) {
            console.warn(`[COLLECTION PARSE] Missing json for ${nftNode?.address}`);
            return null;
        }

        const name = parseNftName(nftJson.name);

        // Try to get description from json first, then fallback to display output
        let description = nftJson.description;
        if (!description) {
            description = nftNode?.asMoveObject?.contents?.display?.output?.description;
        }

        return {
            name,
            description,
        };
    } catch (error) {
        console.error(`[COLLECTION PARSE] Error fetching onchain data for ${type}:`, error);
        return null;
    }
}

export async function saveCollectionData({ type, totalSupply }: { type: string, totalSupply: number }) {
    const data = await getRawOnchainNftData(type);
    if (!data) {
        return;
    }

    const { name, description } = data;

    if (!name?.trim() || !description?.trim()) {
        console.warn(`[COLLECTION PARSE] Missing name or description for ${type}`);
        return;
    }

    try {
        await saveCollectionInDB({
            type,
            name: name.trim(),
            description: description.trim(),
            totalSupply,
        });
    } catch (error) {
        console.error(`[COLLECTION PARSE] Error saving collection to DB:`, error);
    }
}
