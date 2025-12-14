import http from 'http';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { Readable } from 'stream';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

// --- Configuration ---
const PORT = 3001;
const PINATA_JWT = process.env.PINATA_JWT;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "sib";

if (!PINATA_JWT) console.error("❌ Missing PINATA_JWT");
if (!MONGODB_URI) console.error("❌ Missing MONGODB_URI");

// --- MongoDB Helper ---
let dbClient = null;
async function getDb() {
    if (!dbClient) {
        dbClient = new MongoClient(MONGODB_URI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        });
        await dbClient.connect();
        console.log("✅ MongoDB Connected");
    }
    return dbClient.db(MONGODB_DB);
}

// --- Request Handler ---
const server = http.createServer(async (req, res) => {


    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-file-name, x-pda");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname;

    if (pathname === "/api/pinata-upload" && req.method === "POST") {
        try {


            // 1. Read Body
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            if (buffer.length === 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Empty body" }));
                return;
            }

            const fileName = decodeURIComponent(req.headers["x-file-name"] || "upload.bin");
            const pda = req.headers["x-pda"];



            // 2. Upload to Pinata
            const boundary = "----PinataBoundary" + Date.now();
            const formDataParts = [
                `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
                buffer,
                `\r\n--${boundary}\r\nContent-Disposition: form-data; name="pinataMetadata"\r\n\r\n${JSON.stringify({ name: fileName })}\r\n`,
                `--${boundary}\r\nContent-Disposition: form-data; name="pinataOptions"\r\n\r\n${JSON.stringify({ cidVersion: 1 })}\r\n`,
                `--${boundary}--`
            ];

            // Combine parts (Buffer.concat handles strings/buffers mixed if we map properly)
            // Actually simplest to use `fetch` with `FormData` in Node 24 if available, but manual boundary 
            // is safer if we want zero dependencies. 
            // However, we have `form-data` in package.json. Let's use standard fetch with the built-in FormData if possible (Node 18+).

            const form = new FormData();
            form.append("file", new Blob([buffer]), fileName);
            form.append("pinataMetadata", JSON.stringify({ name: fileName }));
            form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

            const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
                method: "POST",
                headers: { "Authorization": `Bearer ${PINATA_JWT}` },
                body: form
            });

            if (!pinataRes.ok) {
                const errText = await pinataRes.text();
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Pinata Upload Failed", details: errText }));
                return;
            }

            const pinataData = await pinataRes.json();
            const cid = pinataData.IpfsHash;


            // 3. Save to MongoDB
            if (pda) {
                try {
                    const db = await getDb();
                    const coll = db.collection("certs");
                    await coll.updateOne(
                        { pda },
                        {
                            $set: { cid, filename: fileName, updatedAt: new Date() },
                            $setOnInsert: { createdAt: new Date() }
                        },
                        { upsert: true }
                    );

                } catch (dbErr) {
                    console.error("⚠️ Mongo Save Failed:", dbErr);
                }
            }

            // 4. Respond
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                cid,
                ipfsUri: `ipfs://${cid}`,
                gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`
            }));

        } catch (err) {
            console.error("❌ Server Error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
    } else if (pathname === "/api/certs/save" && req.method === "POST") {
        try {


            // 1. Read Body
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const bodyStr = Buffer.concat(chunks).toString();

            if (!bodyStr) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "Empty body" }));
                return;
            }

            const body = JSON.parse(bodyStr);


            const { pda, nomor_ijazah, cid, filename, sha256, operator, note } = body;

            if (!pda || !nomor_ijazah || !cid) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "Missing required fields" }));
                return;
            }

            // 2. Save to MongoDB
            const db = await getDb();
            const coll = db.collection("certs");

            const doc = {
                pda: String(pda),
                nomor_ijazah: String(nomor_ijazah),
                cid: String(cid),
                filename: filename ? String(filename) : null,
                sha256: sha256 ? String(sha256) : null,
                operator: operator ? String(operator) : null,
                note: note ? String(note) : null,
                updatedAt: new Date(),
            };

            await coll.updateOne(
                { pda: doc.pda },
                { $set: doc, $setOnInsert: { createdAt: new Date() } },
                { upsert: true }
            );



            // 3. Respond
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, ipfsUri: `ipfs://${cid}` }));

        } catch (err) {
            console.error("❌ Save Error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err.message }));
        }
    } else if (req.method === "GET" && pathname.startsWith("/api/certs/")) {
        try {
            const pda = pathname.split("/").pop();
            if (!pda) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "Missing PDA" }));
                return;
            }

            const db = await getDb();
            const coll = db.collection("certs");
            const doc = await coll.findOne({ pda });

            if (!doc) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "Not found" }));
                return;
            }

            const gatewayUrl = doc.cid ? `https://gateway.pinata.cloud/ipfs/${doc.cid}` : null;

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                ok: true,
                ...doc,
                ipfsUri: doc.cid ? `ipfs://${doc.cid}` : null,
                gatewayUrl
            }));

        } catch (err) {
            console.error("❌ GET Error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err.message }));
        }
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Local API Server running at http://localhost:${PORT}`);
});
