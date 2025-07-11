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
  if (accessToken && Date.now() < tokenExpiresAt) {
    console.log("🔐 Usando token en caché");
    return accessToken;
  }

  try {
    console.log("🔐 Solicitando nuevo token...");
    const tokenURL = `${OMADA_BASE_URL}/openapi/authorize/token?grant_type=client_credentials`;

    const response = await fetch(tokenURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        omadacId: OMADAC_ID,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
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
      apMac,
      ssid,
      radioId = "1",
      vid = "1",
      site =  "6841cfa7f9b1f76de09ddafa5"",
      time = 3600000000,
      authType = "4",
      redirectURL
    } = req.body;

    if (!clientMac) {
      return res.status(400).json({ error: "clientMac es requerido" });
    }

    const isGatewayFlow = !!gatewayMac;
    const required = isGatewayFlow
      ? ["clientMac", "gatewayMac", "vid"]
      : ["clientMac", "apMac", "ssid"];
    const missing = required.filter(k => !req.body[k]);

    if (missing.length > 0) {
      return res.status(400).json({ error: "Parámetros faltantes", detalles: missing });
    }

    const token = await getAccessToken();
    const authURL = `${OMADA_BASE_URL}/openapi/authorize/extPortal/auth`;

    const payload = isGatewayFlow
      ? {
          clientMac,
          gatewayMac,
          vid,
          siteName: site,
          time,
          authType,
          redirectUrl: redirectURL
        }
      : {
          clientMac,
          apMac,
          ssidName: ssid,
          radioId,
          siteName: site,
          time,
          authType,
          redirectUrl: redirectURL
        };

    console.log(`🔎 Tipo de flujo: ${isGatewayFlow ? "Gateway" : "Access Point (EAP)"}`);
    console.log("📤 Payload enviado:", payload);

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

    console.log("✅ Cliente autorizado correctamente:", result);
    res.json({ status: "success", flow: isGatewayFlow ? "gateway" : "ap", result });

  } catch (err) {
    console.error("🔥 Error general:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Activar el servidor
app.listen(PORT, () => {
  console.log(`🌐 Backend listo en puerto ${PORT}`);
});
