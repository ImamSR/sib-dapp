import { MongoClient } from "mongodb";
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "sib";

async function main() {
  if (!uri) throw new Error("MONGODB_URI not set");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection("cert_files");
  const count = await col.countDocuments();
  console.log("✅ Connected. cert_files count =", count);
  await client.close();
}
main().catch((e) => {
  console.error("❌ Mongo test failed:", e);
  process.exit(1);
});
