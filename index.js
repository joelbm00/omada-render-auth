const express = require("express");
const fetch = require("node-fetch");
const https = require("https");
const cors = require("cors");
const dns = require("dns");

function verificarDominioNgrok(host) {
  return new Promise((resolve, reject) => {
    dns.lookup(host, (err, address) => {
      if (err) {
        console.error(`🛑 No se pudo resolver ${host}:`, err.message);
        return reject("El controlador no está disponible (ngrok inactivo o mal configurado).");
      }
      console.log(`🔍 Dominio resuelto: ${host} → ${address}`);
      resolve(address);
    });
  });
}

const app = express();
const port = process.env.PORT || 3000;

const CONTROLLER = "b1a4-190-34-133-54.ngrok-free.app";
const CONTROLLER_PORT = 443;
const CONTROLLER_ID = "6657e53f19e72732099b4edd5ab1105b";
const OPERATOR_USER = "guest-portal";
const OPERATOR_PASS = "Tplink!2027";

app.use(express.json());

app.use(cors({
  origin: "https://pumaweb-d8ef2.web.app",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.options("*", cors());

app.post("/autorizar", async (req, res) => {
  const { clientMac, clientIp, gatewayMac, vid, redirectURL } = req.body;

  if (!clientMac || !clientIp || !gatewayMac || !vid || !redirectURL) {
    return res.status(400).json({ error: "Faltan parámetros" });
  }

  try {
    await verificarDominioNgrok(CONTROLLER);

    let csrfToken = null;
    let cookies = null;
    let loginSuccess = false;

    const loginPaths = [
      `/api/v2/hotspot/login`,
      `/${CONTROLLER_ID}/api/v2/hotspot/login`
    ];

    for (const path of loginPaths) {
      console.log(`🔁 Probando login en: https://${CONTROLLER}:${CONTROLLER_PORT}${path}`);
      try {
        const loginRes = await fetch(`https://${CONTROLLER}:${CONTROLLER_PORT}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: OPERATOR_USER, password: OPERATOR_PASS }),
          agent: new https.Agent({ rejectUnauthorized: false })
        });

        const preview = await loginRes.text();
        console.log(`📨 Respuesta ${path}:`, loginRes.status, preview.slice(0, 100));

        if (loginRes.ok) {
          const retryRes = await fetch(`https://${CONTROLLER}:${CONTROLLER_PORT}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: OPERATOR_USER, password: OPERATOR_PASS }),
            agent: new https.Agent({ rejectUnauthorized: false })
          });

          csrfToken = retryRes.headers.get("x-csrf-token");
          cookies = retryRes.headers.get("set-cookie");

          if (csrfToken && cookies) {
            loginSuccess = true;
            console.log("✅ Login exitoso con ruta:", path);
            break;
          } else {
            console.warn("⚠️ Login respondió pero sin CSRF token.");
          }
        }
      } catch (err) {
        console.error(`❌ Falló intento en ${path}:`, err.message);
      }
    }

    if (!loginSuccess || !csrfToken) {
      throw new Error("Login fallido o falta CSRF token. Verifica rutas o credenciales.");
    }

    console.log("🔥 Autorizando con:", {
      csrfToken,
      cookies,
      clientMac,
      clientIp,
      gatewayMac,
      vid,
      redirectURL
    });

    const authRes = await fetch(`https://${CONTROLLER}:${CONTROLLER_PORT}/${CONTROLLER_ID}/api/v2/hotspot/extPortal/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        "Cookie": cookies
      },
      body: JSON.stringify({ clientMac, clientIp, gatewayMac, vid, redirectURL }),
      agent: new https.Agent({ rejectUnauthorized: false })
    });

    const authText = await authRes.text();
    console.log("📨 Respuesta OC200:", authRes.status, authText.slice(0, 150));

    if (!authRes.ok) {
      throw new Error(`Autorización fallida: ${authRes.status} - ${authText}`);
    }

    return res.status(200).json({ success: true, message: "Cliente autorizado" });
  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Servidor escuchando en puerto ${port}`);
});
