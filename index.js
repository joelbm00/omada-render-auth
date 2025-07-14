import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const {
  CLIENT_ID,
  CLIENT_SECRET,
  OMADA_BASE_URL,
  PORT = 3000
} = process.env;

const OMADAC_ID = "abba36f3748107717a36d14d8234bc41";

let accessToken = null;
let tokenExpiresAt = 0;

// Endpoint simple para validar conectividad
app.get("/status", (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Endpoint de depuración para ver estado de variables
app.get("/debug-env", (req, res) => {
  res.json({
    OMADA_BASE_URL: OMADA_BASE_URL || "❌ no definida",
    OMADAC_ID: OMADAC_ID || "❌ no definida",
    CLIENT_ID: CLIENT_ID || "❌ no definida",
    CLIENT_SECRET: CLIENT_SECRET ? "[OK]" : "❌ no definida"
  });
});

// Obtener accessToken desde TP-Link
async function getAccessToken() {
  let accessToken = null;
  let tokenExpiresAt = 0;

  // Evitamos caché para pruebas en caliente
  console.log("🔐 Solicitando nuevo token...");
  const OMADA_BASE_URL = "https://use1-omada-northbound.tplinkcloud.com";
  const omadacId = "abba36f3748107717a36d14d8234bc41";
  const client_id = "77498f4e4c05414197ffb2e484eb7d46";
  const client_secret = "9031f6c75bea4c70ac0c46f6699bbc82";

  const tokenURL = `${OMADA_BASE_URL}/openapi/authorize/token?grant_type=client_credentials`;

  try {
    const response = await fetch(tokenURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        omadacId,
        client_id,
        client_secret
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Token falló (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    accessToken = data.result.accessToken;
    tokenExpiresAt = Date.now() + (data.result.expiresIn - 30) * 1000;

    console.log("✅ Token obtenido:", accessToken);
    return accessToken;

  } catch (err) {
    console.error("🔥 Error obteniendo token:", err.message);
    throw err;
  }
}


// Autorizar cliente desde gateway o access point
app.post("/autorizar", async (req, res) => {
  console.log("📥 Petición recibida en /autorizar");
  console.log("🧾 Payload recibido:", req.body);

  try {
    const {
      clientMac,
      gatewayMac,
      vid = "25",
      site = "WiFiTestOffice",
      time = 3600000000,
      authType = "4",
      redirectURL
    } = req.body;

    // Validación mínima obligatoria para Gateway
    const required = ["clientMac", "gatewayMac", "vid"];
    const missing = required.filter(k => !req.body[k]);

    if (missing.length > 0) {
      return res.status(400).json({ error: "Parámetros faltantes", detalles: missing });
    }

    const token = await getAccessToken();
    const authURL = `${OMADA_BASE_URL}/openapi/authorize/extPortal/auth`;

    const payload = {
      clientMac,
      gatewayMac,
      vid,
      siteName: site,
      time,
      authType,
      redirectUrl: redirectURL
    };

    console.log("📤 Enviando payload gateway:", payload);

    const response = await fetch(authURL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Falló autorización:", result);
      return res.status(response.status).json({
        error: "Error autorizando cliente",
        details: result
      });
    }

    console.log("✅ Cliente autorizado vía Gateway:", result);
    res.json({ status: "success", flow: "gateway", result });

  } catch (err) {
    console.error("🔥 Error general:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// Activar el servidor
app.listen(PORT, () => {
  console.log(`🌐 Backend listo en puerto ${PORT}`);
});
