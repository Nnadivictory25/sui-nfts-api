import { GraphQLClient } from "graphql-request";
import { GRAPHQL_ENDPOINT } from "./constants";
import { getSdk } from "./generated/graphql";
import { migrateDatabase } from "./db/migrate";
import { indexNfts } from "./poller";
import { getNftById, getNftsByType } from "./db/utils";
import { formatRawNft } from "./utils";

const isDev = process.env.NODE_ENV === "development";
const port = process.env.PORT || 3232;

if (!isDev) {
    migrateDatabase();
}

const gqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);
export const sdk = getSdk(gqlClient);

indexNfts();

// async function getNfts() {
//     const nftType = "0x034c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachin";
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

                return Response.json(nft);
            }
        }
    }
})

console.log(`Server is running on port ${port}`);