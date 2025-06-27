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

    let authToken = null;
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
          body: JSON.stringify({
            name: OPERATOR_USER,
            password: OPERATOR_PASS
          }),
          agent: new https.Agent({ rejectUnauthorized: false })
        });

        const data = await loginRes.json();
        console.log(`📨 Respuesta ${path}:`, loginRes.status, data?.msg || data);

        if (loginRes.ok && data?.result?.token) {
          authToken = data.result.token;
          loginSuccess = true;
          console.log("✅ Login exitoso con ruta:", path);
          break;
        }
      } catch (err) {
        console.error(`❌ Falló login en ${path}:`, err.message);
      }
    }

    if (!loginSuccess || !authToken) {
      throw new Error("Login fallido o falta token. Verifica rutas o credenciales.");
    }

    const authURL = `https://${CONTROLLER}:${CONTROLLER_PORT}/${CONTROLLER_ID}/api/v2/hotspot/extPortal/auth`;
    const payload = { clientMac, clientIp, gatewayMac, vid, redirectURL };

    console.log("🔥 Autorizando cliente con token:", authToken.slice(0, 8) + "...");
    console.log("📦 Datos del cliente:", payload);

    let authRes, authText, authType;

    // Primer intento: Authorization header
    try {
      authRes = await fetch(authURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload),
        agent: new https.Agent({ rejectUnauthorized: false })
      });

      authText = await authRes.text();
      authType = authRes.headers.get("content-type") || "unknown";
      console.log("📨 Respuesta OC200 (Bearer):", authRes.status, "-", authType);
    } catch (err) {
      console.error("❌ Error en envío con Authorization:", err.message);
    }

    // Si falló, reintentamos con token en el cuerpo
    if (!authRes.ok || authType.includes("text/html")) {
      console.log("🔁 Reintentando con token en el cuerpo...");
      const altPayload = { token: authToken, ...payload };

      authRes = await fetch(authURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(altPayload),
        agent: new https.Agent({ rejectUnauthorized: false })
      });

      authText = await authRes.text();
      authType = authRes.headers.get("content-type") || "unknown";
      console.log("📨 Respuesta OC200 (Token en cuerpo):", authRes.status, "-", authType);
    }

    if (!authRes.ok || authType.includes("text/html")) {
      throw new Error(`Autorización fallida (${authRes.status}) o respuesta HTML inesperada.`);
    }

    console.log("✅ Cliente autorizado correctamente.");
    return res.status(200).json({ success: true, message: "Cliente autorizado correctamente" });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Servidor escuchando en puerto ${port}`);
});
