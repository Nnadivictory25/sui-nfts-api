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

const safeInc = (map: Map<string, number>, key: string) =>
    map.set(key, (map.get(key) ?? 0) + 1);

/** Main entry point */
export async function updateRarityScores(nftType: string) {
    console.log('Starting rarity score calculation...');

    const allNfts = await getNftsByType(nftType);
    const total = allNfts.length;

    // -----------------------------------------------------------------
    // 1. Build trait counters (skip NFTs without any attributes)
    // -----------------------------------------------------------------
    const traitCounts = new Map<string, Map<string, number>>(); // trait → value → count
    const nftScores = new Map<string, { score: number; attrCount: number }>();

    for (const nft of allNfts) {
        if (!nft.attributes?.length) {
            nftScores.set(nft.id, { score: 0.001, attrCount: 0 });
            continue;
        }

        let score = 0;
        let attrCount = 0;

        for (const attr of nft.attributes) {
            if (!attr?.key || !attr?.value) continue;

            const type = attr.key;
            const value = attr.value;

            // initialise nested map on first encounter
            if (!traitCounts.has(type)) traitCounts.set(type, new Map());

            const valueMap = traitCounts.get(type)!;
            safeInc(valueMap, value);

            // temporary score (will be finalised after the loop)
            const count = valueMap.get(value)!;
            score += 1 / (count / total);
            attrCount++;
        }

        nftScores.set(nft.id, { score: attrCount ? score : 0.001, attrCount });
    }

    if (!traitCounts.size) {
        console.warn('No NFTs with attributes – nothing to rank.');
        return;
    }

    // -----------------------------------------------------------------
    // 2. Rank by float score
    // -----------------------------------------------------------------
    const ranked = Array.from(nftScores.entries())
        .sort(([, a], [, b]) => b.score - a.score)
        .map(([id], idx) => ({ id, score: idx + 1 }));

    // -----------------------------------------------------------------
    // 3. Persist + log top 5
    // -----------------------------------------------------------------
    await updateRarityScoreInDB(ranked);
    console.log(`Rarity scores saved for ${ranked.length} NFTs`);

    console.log('\nTop 5:');
    ranked.slice(0, 5).forEach((r, i) => {
        const { score: floatScore, attrCount } = nftScores.get(r.id)!;
        console.log(
            `Rank ${r.score}: ${r.id} (${attrCount} attrs, raw ${floatScore.toFixed(2)})`
        );
    });
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

        // Try to get name and description from display output first
        const displayOutput = nftNode?.asMoveObject?.contents?.display?.output;
        let name = displayOutput?.name;
        let description = displayOutput?.description;

        // Fallback to json if display output is not available
        if (!name || !description) {
            const nftJson = nftNode?.asMoveObject?.contents?.json;
            if (nftJson) {
                name = name || nftJson.name;
                description = description || nftJson.description;
            }
        }

        if (!name && !description) {
            console.warn(`[COLLECTION PARSE] Missing name and description for ${nftNode?.address}`);
            return null;
        }

        const parsedName = parseNftName(name);

        return {
            name: parsedName,
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
