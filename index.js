// server.js (o index.js)

import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from 'cors';


dotenv.config();

const app = express();
app.use(express.json());

const app = cors();
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

  const response = await fetch(`${OMADA_BASE_URL}/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });

  if (!response.ok) throw new Error("❌ Error obteniendo token");

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 30) * 1000;

  return accessToken;
}

async function getSiteId() {
  const token = await getAccessToken();
  const res = await fetch(`${OMADA_BASE_URL}/v2/sites`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data?.data?.[0]?.siteId || process.env.DEFAULT_SITE_ID;
}

app.post("/autorizar", async (req, res) => {
  try {
    const {
      clientMac,
      apMac,
      ssid,
      radioId = "1",
      site = "Default",
      time = 3600000000,
      authType = "4",
      redirectURL
    } = req.body;

    if (!clientMac || !apMac || !ssid) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const token = await getAccessToken();
    const siteId = await getSiteId();

    const authURL = `${OMADA_BASE_URL}/v2/sites/${siteId}/hotspot/extPortal/auth`;

    const payload = {
      clientMac,
      apMac,
      ssidName: ssid,
      radioId,
      siteName: site,
      time,
      authType,
      redirectUrl: redirectURL
    };

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

    console.log("✅ Autorizado correctamente:", result);
    res.json({ status: "success", result });

  } catch (err) {
    console.error("🔥 Error general:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Backend listo en puerto ${PORT}`);
});
