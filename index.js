// Primer intento: Authorization header
try {
  authRes = await fetch(authURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${authToken}`,
      ...(cookies ? { "Cookie": cookies } : {})
    },
    body: JSON.stringify(payload),
    agent: new https.Agent({ rejectUnauthorized: false })
  });

  authText = await authRes.text();
  authType = authRes.headers.get("content-type") || "desconocido";

  console.log("📨 Respuesta OC200 (Bearer):", authRes.status, "-", authType);
  console.log("🧾 HTML devuelto por OC200 (Bearer):\n", authText.slice(0, 500));
} catch (err) {
  console.error("❌ Error en envío con Authorization:", err.message);
}

// Segundo intento: token en el cuerpo
if (!authRes?.ok || authType.includes("text/html")) {
  console.log("🔁 Reintentando con token en el cuerpo...");

  const altPayload = { token: authToken, ...payload };

  authRes = await fetch(authURL, {
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
  console.log("🧾 HTML devuelto por OC200 (Token en body):\n", authText.slice(0, 500));
}
