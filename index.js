const express = require("express");
const fetch = require("node-fetch");
const https = require("https");
const cors = require("cors");
const dns = require("dns");

const app = express();
const port = process.env.PORT || 3000;

// Configuración del controlador OC200
const CONTROLLER = "dcbb-190-34-133-54.ngrok-free.app";
const CONTROLLER_PORT = 443;
const CONTROLLER_ID = "6657e53f19e72732099b4edd5ab1105b";
const OPERATOR_USER = "guest-portal";
const OPERATOR_PASS = "Tplink!2027";

// Middleware
app.use(express.json());
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.options("*", cors());

// Función auxiliar para timeout
const fetchConTimeout = async (url, options, timeoutMs = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    if (err.name === "AbortError") {
      throw new Error("⏱️ Timeout: OC200 no respondió en 10 segundos");
    }
    throw err;
  }
};

// Verificación de dominio
function verificarDominioNgrok(host) {
  return new Promise((resolve, reject) => {
    dns.lookup(host, (err, address) => {
      if (err) {
        console.error(`🛑 No se pudo resolver ${host}:`, err.message);
        return reject("Ngrok inactivo o mal configurado");
      }
      console.log(`🔍 Dominio resuelto: ${host} → ${address}`);
      resolve(address);
    });
  });
}

// Endpoint principal
app.post("/autorizar", async (req, res) => {
  let { clientMac, clientIp, gatewayMac, vid, redirectURL } = req.body;

  gatewayMac = gatewayMac || "DC-62-79-5F-D7-93";
  vid = vid || "25";

  if (!clientMac || !clientIp || !redirectURL) {
    return res.status(400).json({ error: "Faltan parámetros obligatorios (MAC, IP o URL)" });
  }

  console.log("📩 Payload recibido:", { clientMac, clientIp, gatewayMac, vid, redirectURL });

  try {
    await verificarDominioNgrok(CONTROLLER);

    let authToken = null;
    let cookies = null;
    let loginSuccess = false;

    const loginPaths = [
      `/api/v2/hotspot/login`,
      `/${CONTROLLER_ID}/api/v2/hotspot/login`
    ];

    for (const path of loginPaths) {
      console.log(`🔁 Probando login en: https://${CONTROLLER}:${CONTROLLER_PORT}${path}`);
      try {
        const loginRes = await fetchConTimeout(`https://${CONTROLLER}:${CONTROLLER_PORT}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: OPERATOR_USER, password: OPERATOR_PASS }),
          agent: new https.Agent({ rejectUnauthorized: false })
        });

        const data = await loginRes.json();
        cookies = loginRes.headers.get("set-cookie");
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
      throw new Error("Login fallido o token ausente. Verifica credenciales o rutas.");
    }

    const authURL = `https://${CONTROLLER}:${CONTROLLER_PORT}/${CONTROLLER_ID}/api/v2/hotspot/extPortal/auth`;
    const basePayload = { clientMac, clientIp, gatewayMac, vid, redirectURL };

    // Primer intento: Authorization header
    let authRes, authText, authType;
    try {
      authRes = await fetchConTimeout(authURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${authToken}`,
          ...(cookies ? { "Cookie": cookies } : {})
        },
        body: JSON.stringify(basePayload),
        agent: new https.Agent({ rejectUnauthorized: false })
      });

      authText = await authRes.text();
      authType = authRes.headers.get("content-type") || "desconocido";
      console.log("📨 Respuesta OC200 (Bearer):", authRes.status, "-", authType);
      console.log("🧾 HTML devuelto (Bearer):\n", authText.slice(0, 500));
    } catch (err) {
      console.error("❌ Error en intento con Bearer:", err.message);
    }

    // Segundo intento: token en el body
    if (!authRes?.ok || authType.includes("text/html")) {
      console.log("🔁 Reintentando con token en el body...");
      const altPayload = { token: authToken, ...basePayload };

      authRes = await fetchConTimeout(authURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...(cookies ? { "Cookie": cookies } : {})
        },
        body: JSON.stringify(altPayload),
        agent: new https.Agent({ rejectUnauthorized: false })
      });

      authText = await authRes.text();
      authType = authRes.headers.get("content-type") || "desconocido";
      console.log("📨 Respuesta OC200 (Token en body):", authRes.status, "-", authType);
      console.log("🧾 HTML devuelto (Token en body):\n", authText.slice(0, 500));
    }

    if (!authRes.ok || authType.includes("text/html")) {
      throw new Error(`Autorización fallida (${authRes.status}) o respuesta HTML inesperada del OC200`);
    }

    console.log("✅ Cliente autorizado correctamente.");
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Servidor escuchando en puerto ${port}`);
});
