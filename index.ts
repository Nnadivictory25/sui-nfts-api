import { GraphQLClient } from "graphql-request";
import { GRAPHQL_ENDPOINT } from "./constants";
import { getSdk } from "./generated/graphql";
import { migrateDatabase } from "./db/migrate";

const isDev = process.env.NODE_ENV === "development";

if (!isDev) {
    migrateDatabase();
}

const gqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);
const sdk = getSdk(gqlClient);

async function getNfts() {
    const { objects } = await sdk.GetNftsByType({
        nftType: "0xf75f70c333292e9258ba1c6fc44e6bccfa2bd03bbed6d8e6e343f06f3b22a7f4::suimilios::SUIMILIOS_NFT",
        first: 10,
        after: null,
    });
    Bun.write("nfts.json", JSON.stringify(objects?.nodes, null, 2));
}

getNfts();