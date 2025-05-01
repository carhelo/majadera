const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

const MONGO_URI = "mongodb+srv://durangarciacarlosg1:23072311Bri@cluster0.tvkv5ec.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "majadera";
const COLLECTION_NAME = "detectedWords";

const BADWORDS_FILE = "server/badwords.json";

app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "js")));

let BAD_WORDS = [];
if (fs.existsSync(BADWORDS_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(BADWORDS_FILE, "utf8"));
        if (data && Array.isArray(data.badwords)) {
            BAD_WORDS = data.badwords;
        } else {
            console.error("⚠️ El archivo badwords.json no tiene un formato válido.");
        }
    } catch (error) {
        console.error("⚠️ Error al leer badwords.json:", error);
    }
}

let startTime = null;
const lastDetections = new Map();

function formatElapsedTime(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function isMaskedWord(word) {
    return /^\*{3,16}$/.test(word);
}

MongoClient.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        io.on("connection", async (socket) => {
            console.log("Usuario conectado");
            const initialWords = await collection.find({}).sort({ _id: -1 }).toArray();
            socket.emit("updateWords", initialWords);

            socket.on("startDetection", () => {
                startTime = new Date();
                socket.emit("resetTimer");
            });

            socket.on("newText", async (text) => {
                const rawWords = text.split(/\s+/);
                let filteredWords = [];
                let last = "";
                rawWords.forEach(w => {
                    const clean = w.replace(/[.,!¡¿?;:]/g, "").toLowerCase();
                    if (clean && clean !== last) {
                        filteredWords.push(clean);
                        last = clean;
                    }
                });

                let detected = false;

                for (let index = 0; index < filteredWords.length; index++) {
                    const word = filteredWords[index];
                    const cleanWord = word.replace(/\*/g, "");
                    const isBad = BAD_WORDS.includes(cleanWord) || isMaskedWord(word);

                    if (isBad) {
                        const context = filteredWords.slice(Math.max(0, index - 5), index + 6).join(" ");
                        const timestamp = new Date().toLocaleTimeString();
                        const elapsedTime = startTime ? formatElapsedTime(new Date() - startTime) : "N/A";
                        const entry = { timestamp, word, context, elapsedTime };

                        const key = word + "|" + context;
                        const now = Date.now();
                        const lastTime = lastDetections.get(key) || 0;

                        if (now - lastTime > 30000) {
                            await collection.insertOne(entry);
                            lastDetections.set(key, now);
                            detected = true;
                        }
                    }
                }

                if (detected) {
                    const updatedWords = await collection.find({}).sort({ _id: -1 }).toArray();
                    io.emit("updateWords", updatedWords);
                    io.emit("clearLiveText");
                }
            });

            socket.on("deleteWord", async (index) => {
                const allWords = await collection.find({}).sort({ _id: -1 }).toArray();
                if (index >= 0 && index < allWords.length) {
                    const toDelete = allWords[index];
                    await collection.deleteOne({ _id: toDelete._id });
                    const updatedWords = await collection.find({}).sort({ _id: -1 }).toArray();
                    io.emit("updateWords", updatedWords);
                }
            });
        });

        server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error("❌ Error al conectar con MongoDB:", err);
    });
