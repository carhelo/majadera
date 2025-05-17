const fs = require("fs");
const admin = require("firebase-admin");

// Cargar la clave privada de Firebase
const serviceAccount = require("./serviceAccountKey.json");

// Inicializar Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://badwords-detector-default-rtdb.firebaseio.com"
});

const db = admin.database();
const wordsRef = db.ref("detectedWords");

// Leer data.json
const localData = JSON.parse(fs.readFileSync("data.json", "utf8"));

// Validar que sea un array
if (!Array.isArray(localData)) {
  console.error("❌ El archivo data.json no contiene un array válido.");
  process.exit(1);
}

// Subir a Firebase
wordsRef.set(localData)
  .then(() => {
    console.log("✅ Datos migrados correctamente a Firebase.");
  })
  .catch((err) => {
    console.error("❌ Error al migrar los datos a Firebase:", err);
  });
