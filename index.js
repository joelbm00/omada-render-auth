// server.js (o index.js)

import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from 'cors';


dotenv.config();

const app = express();
app.use(express.json());
app.use(cors()); // Sin restricciones

const {
  CLIENT_ID,
  CLIENT_SECRET,
  OMADA_BASE_URL, // Ej: https://cloud.omada.com
  PORT = 3000
} = process.env;

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  const response = await fetch(`${OMADA_BASE_URL}/openapi/authorize/token?grant_type=client_credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      omadacId: OMADAC_ID,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });

  if (!response.ok) throw new Error("❌ Error obteniendo token");

  const data = await response.json();
  accessToken = data.result.accessToken;
  tokenExpiresAt = Date.now() + (data.result.expiresIn - 30) * 1000;

  return accessToken;
}

async function getSiteId() {
  const token = await getAccessToken();
  const res = await fetch(`${OMADA_BASE_URL}/v1/sites`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data?.data?.[0]?.siteId || process.env.DEFAULT_SITE_ID;
}

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
      site = "Default",
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

    console.log("✅ Cliente autorizado:", result);
    res.json({ status: "success", flow: isGatewayFlow ? "gateway" : "ap", result });

  } catch (err) {
    console.error("🔥 Error general:", err.message);
    res.status(500).json({ error: err.message });
  }
});


app.listen(PORT,() => {
   console.log(' Backend list en puerto $(PORT)');
});
