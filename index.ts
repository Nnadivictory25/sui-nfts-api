import { GraphQLClient } from "graphql-request";
import { GRAPHQL_ENDPOINT } from "./constants";
import { getSdk } from "./generated/graphql";
import { migrateDatabase } from "./db/migrate";
import { indexNfts } from "./poller";
import { deleteCollectionByType, getNftById, checkNftTypeStatus, addNftTypeToIndex } from "./db/utils";
import { formatRawNft, validateNftType } from "./utils";

const isDev = process.env.NODE_ENV === "development";
const port = process.env.PORT || 3232;

if (!isDev) {
    migrateDatabase();
}

const gqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);
export const sdk = getSdk(gqlClient);

indexNfts();

// async function getNfts() {
//     const nftType = "0x7c02d0be6b6dfaeaf8aeebdf0967cb6f0f5c187c86e3b054e27c195bea30c9b5::puggies::Puggies";
//     const { objects } = await sdk.GetNftsByType({
//         nftType: nftType,
//         first: 3,
//         after: null,
//     });
//     const formattedNfts = objects?.nodes?.map(node => formatRawNft({ nftNode: node, collectionType: nftType }));
//     console.log(formattedNfts?.[0]);
//     Bun.write("nfts.json", JSON.stringify(objects?.nodes, null, 2));
// }


// getNfts();


Bun.serve({
    port,
    development: isDev,
    routes: {
        "/nfts/:id": {
            GET: async (req) => {
                const { id } = req.params;
                const [nft] = await getNftById(id);

                if (!nft) {
                    return new Response("NFT not found", { status: 404 });
                }

                return Response.json(nft, {
                    headers: {
                        "Cache-Control": "public, max-age=31536000, immutable"
                    }
                });
            }
        },

        "/nfts/:type": {
            DELETE: async (req) => {
                const { type } = req.params;
                const headers = req.headers;
                const authorization = headers.get("Authorization");

                if (!authorization) {
                    return new Response("Unauthorized", { status: 401 });
                }

                if (authorization !== `Bearer ${process.env.API_KEY}`) {
                    return new Response("Unauthorized", { status: 401 });
                }

                await deleteCollectionByType(type);
                return Response.json({ message: "Collection deleted" }, { status: 200 });
            },
        },

        "/index": {
            POST: async (req) => {
                try {
                    const body = await req.json();
                    const { nftType } = body;

                    // Validate NFT type format
                    const validation = validateNftType(nftType);
                    if (!validation.valid) {
                        return Response.json({ error: validation.error }, { status: 400 });
                    }

                    // Check current status
                    const statusCheck = await checkNftTypeStatus(nftType);
                    if (statusCheck.status !== 'available') {
                        return Response.json({
                            message: statusCheck.message,
                            status: statusCheck.status,
                            nftType
                        }, { status: 200 });
                    }

                    // Add to index queue
                    const result = await addNftTypeToIndex(nftType);
                    if (!result.success) {
                        return Response.json({ error: result.error }, { status: 500 });
                    }

                    return Response.json({
                        message: "NFT type added to indexing queue",
                        status: "queued",
                        nftType,
                        queuePosition: result.queuePosition
                    }, { status: 201 });

                } catch (error) {
                    console.error('Error processing index request:', error);
                    return Response.json({ error: "Internal server error" }, { status: 500 });
                }
            }
        },
    },
});


console.log(`Server is running on port ${port}`);