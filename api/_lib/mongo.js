import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "sib";

// cache across invocations
let cached = globalThis.__mongoCache;
if (!cached) cached = globalThis.__mongoCache = { client: null, db: null };

export async function getDb(name = dbName) {
  if (!uri) throw new Error("MONGODB_URI not set");
  if (cached.db) return cached.db;
  if (!cached.client) {
    cached.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });
    await cached.client.connect();
  }
  cached.db = cached.client.db(name);
  return cached.db;
}