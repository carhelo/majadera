const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const DATA_FILE = "data.json";
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

let detectedWords = [];
if (fs.existsSync(DATA_FILE)) {
    try {
        detectedWords = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        if (!Array.isArray(detectedWords)) detectedWords = [];
    } catch (error) {
        console.error("⚠️ Error al leer data.json:", error);
        detectedWords = [];
    }
}

let startTime = null;
const lastDetections = new Map(); 
const DETECTION_DELAY = 10000; 

function formatElapsedTime(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function isMaskedWord(word) {
    return /^\*{3,16}$/.test(word);
}

io.on("connection", (socket) => {
    console.log("Usuario conectado");
    socket.emit("updateWords", detectedWords);

    socket.on("startDetection", () => {
        startTime = new Date();
        socket.emit("resetTimer");
    });

    socket.on("newText", (text) => {
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

        filteredWords.forEach((word, index) => {
            const cleanWord = word.replace(/\*/g, "");
            const isBad = BAD_WORDS.includes(cleanWord) || isMaskedWord(word);

            if (isBad) {
                const context = filteredWords.slice(Math.max(0, index - 5), index + 6).join(" ");
                const timestamp = new Date().toISOString(); 
                const elapsedTime = startTime ? formatElapsedTime(new Date() - startTime) : "N/A";
                const entry = { timestamp, word, context, elapsedTime };

                const now = Date.now();
                const lastTime = lastDetections.get(cleanWord) || 0;

                if (now - lastTime > DETECTION_DELAY) { 
                    detectedWords.unshift(entry);
                    lastDetections.set(cleanWord, now); 
                    detected = true;
                }
            }
        });

        if (detected) {
            try {
                fs.writeFileSync(DATA_FILE, JSON.stringify(detectedWords, null, 2));
                io.emit("updateWords", detectedWords);
                io.emit("clearLiveText");
            } catch (error) {
                console.error("⚠️ Error al escribir en data.json:", error);
            }
        }
    });

    socket.on("deleteWord", (index) => {
        detectedWords.splice(index, 1); 
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(detectedWords, null, 2)); 
            io.emit("updateWords", detectedWords); 
        } catch (error) {
            console.error("⚠️ Error al escribir en data.json:", error);
        }
    });
});

server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));