const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const BADWORDS_FILE = "server/badwords.json";

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://badwords-detector-default-rtdb.firebaseio.com"
});

const db = admin.database();
const wordsRef = db.ref("detectedWords");

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
let startTime = null;
const lastDetections = new Map(); 
const lastContexts = new Map();   
const DETECTION_DELAY = 30000; 

function formatElapsedTime(ms) {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function isMaskedWord(word) {
  return /^\*{3,16}$/.test(word);
}

wordsRef.once("value")
  .then(snapshot => {
    const data = snapshot.val();
    detectedWords = Array.isArray(data) ? data : [];
    console.log("✅ Datos cargados desde Firebase.");

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
            const lastWordTime = lastDetections.get(cleanWord) || 0;
            const lastContextTime = lastContexts.get(context) || 0;

            if ((now - lastContextTime > DETECTION_DELAY)) {
              detectedWords.unshift(entry);
              lastDetections.set(cleanWord, now);
              lastContexts.set(context, now);
              detected = true;
            }
          }
        });

        if (detected) {
          wordsRef.set(detectedWords)
            .then(() => {
              io.emit("updateWords", detectedWords);
              io.emit("clearLiveText");
            })
            .catch((error) => {
              console.error("⚠️ Error al guardar en Firebase:", error);
            });
        }
      });

      socket.on("deleteWord", (index) => {
        if (index >= 0 && index < detectedWords.length) {
          detectedWords.splice(index, 1);
          wordsRef.set(detectedWords)
            .then(() => {
              io.emit("updateWords", detectedWords);
            })
            .catch((error) => {
              console.error("⚠️ Error al borrar en Firebase:", error);
            });
        }
      });
    });

    server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
  })
  .catch(error => {
    console.error("⚠️ Error al cargar datos desde Firebase:", error);
  });
