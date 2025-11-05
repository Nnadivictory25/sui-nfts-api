# Sui NFTs Data Service

A REST API service that indexes and serves Sui blockchain NFT collection data.

## API Endpoints

### GET `/nfts/:id`
Retrieve a specific NFT by its ID.

**Response:**
```json
{
  "id": "string",
  "name": "string", 
  "type": "string",
  "rank": number,
  "imageUrl": "string",
  "attributes": [
    {
      "key": "string",
      "value": "string"
    }
  ]
}
```

Returns 404 if NFT not found. Includes aggressive cache headers (1 year immutable) since NFT metadata rarely changes after minting.

### DELETE `/nfts/:type`
Delete an entire NFT collection by type (requires API key).

**Headers:**
```
Authorization: Bearer YOUR_API_KEY
```

**Response:**
```json
{
  "message": "Collection deleted"
}
```

Returns 401 if unauthorized.

## Self-Hosting

### Prerequisites
- Bun runtime
- SQLite database

### Setup
```bash
# Install dependencies
bun install

# Generate database schema
bun run db:gen

# Run database migrations
bun run db:migrate

# Start the service
bun run start
```

### Environment Variables
- `PORT` - Server port (default: 3232)
- `NODE_ENV` - Environment (development/production)
- `API_KEY` - Required for DELETE operations

### Configuration
Edit `data/index-data.json` to specify which NFT collections to index:
```json
{
  "to_index": [
    "0x7c02d0be6b6dfaeaf8aeebdf0967cb6f0f5c187c86e3b054e27c195bea30c9b5::puggies::Puggies",
    "0x8f74a7d632191e29956df3843404f22d27bd84d92cca1b1abde621d033098769::rootlet::Rootlet"
  ]
}
```

The service automatically indexes collections on startup and calculates rarity scores.