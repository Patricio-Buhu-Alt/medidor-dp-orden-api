// Medidor DP → Orden Shopify  ·  mini-endpoint
// Recibe la DP + N° de orden + email, verifica que la orden sea del cliente
// (el email debe coincidir) y escribe la DP en la orden como NOTA + METAFIELD.
//
// Autenticación: CLIENT CREDENTIALS GRANT (modelo Dev Dashboard 2025).
// El backend intercambia Client ID + Client Secret por un access token de 24 h
// (se cachea y renueva solo). Requiere que la app y la tienda estén en la MISMA
// organización del Dev Dashboard y que la app esté instalada con scopes read_orders/write_orders.
//
// Variables de entorno (ver .env.example):
//   SHOPIFY_STORE          buhu-cl.myshopify.com
//   SHOPIFY_CLIENT_ID      Client ID de la app (Dev Dashboard → Settings)   [OBLIGATORIO]
//   SHOPIFY_CLIENT_SECRET  Client Secret (shpss_…) de la app                [OBLIGATORIO]
//   API_VERSION            2024-10 (por defecto)
//   ALLOWED_ORIGIN         orígenes permitidos, separados por coma
//   PORT                   lo asigna Render automáticamente

import express from "express";
import cors from "cors";

const app = express();
app.use(express.json({ limit: "16kb" }));

const STORE   = process.env.SHOPIFY_STORE || "buhu-cl.myshopify.com";
const CLIENT_ID     = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const VERSION = process.env.API_VERSION || "2024-10";
const ORIGINS = (process.env.ALLOWED_ORIGIN ||
  "https://patricio-buhu-alt.github.io,https://www.buhu.cl,https://buhu.cl")
  .split(",").map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // permite herramientas sin origin (curl) y los orígenes de la lista
    if (!origin || ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("Origen no permitido"));
  },
  methods: ["POST", "OPTIONS"]
}));

// --- token vía client credentials grant (cacheado, se renueva antes de expirar) ---
let _tok = { value: null, exp: 0 };
async function getToken() {
  const now = Date.now();
  if (_tok.value && now < _tok.exp - 60000) return _tok.value;   // 60s de margen
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  });
  const r = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body
  });
  if (!r.ok) throw new Error("token " + r.status + ": " + (await r.text()));
  const j = await r.json();
  _tok = { value: j.access_token, exp: now + (j.expires_in || 86399) * 1000 };
  return _tok.value;
}

// --- helper: llamada a la Admin GraphQL API ---
async function shopify(query, variables) {
  const token = await getToken();
  const r = await fetch(`https://${STORE}/admin/api/${VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json();
  if (j.errors) throw new Error("GraphQL: " + JSON.stringify(j.errors));
  return j.data;
}

const clean = v => String(v || "").trim();
const num1  = v => (v === null || v === undefined || v === "") ? null : String(v);

app.get("/", (_req, res) => res.json({ ok: true, service: "medidor-dp-orden-api" }));

app.post("/dp", async (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ ok: false, error: "config" });

    const order = clean(req.body.order).replace(/[^a-zA-Z0-9]/g, "");
    const email = clean(req.body.email).toLowerCase();
    const dp = {
      total:      num1(req.body.total),
      od:         num1(req.body.od),
      oi:         num1(req.body.oi),
      cerca:      num1(req.body.cerca),
      fiabilidad: clean(req.body.fiabilidad) || null
    };

    if (!order)        return res.status(400).json({ ok: false, error: "falta_orden" });
    if (!email)        return res.status(400).json({ ok: false, error: "falta_email" });
    if (!dp.total)     return res.status(400).json({ ok: false, error: "falta_dp" });

    // 1) buscar la orden por número
    const found = await shopify(
      `query($q:String!){ orders(first:1, query:$q){ edges{ node{ id name email note } } } }`,
      { q: `name:#${order}` }
    );
    const node = found?.orders?.edges?.[0]?.node;
    if (!node) return res.status(404).json({ ok: false, error: "orden_no_encontrada" });

    // 2) verificar que el email coincide con el de la orden
    const orderEmail = (node.email || "").toLowerCase();
    if (!orderEmail || orderEmail !== email) {
      return res.status(403).json({ ok: false, error: "email_no_coincide" });
    }

    // 3) escribir NOTA + METAFIELD
    const fecha = new Date().toISOString().slice(0, 10);
    const partes = [`Total ${dp.total} mm`];
    if (dp.od)    partes.push(`OD ${dp.od}`);
    if (dp.oi)    partes.push(`OI ${dp.oi}`);
    if (dp.cerca) partes.push(`cerca ${dp.cerca}`);
    if (dp.fiabilidad) partes.push(`fiabilidad ${dp.fiabilidad}`);
    const dpLinea = `📏 DP autoreportada por el cliente (Medidor Buhu) — ${partes.join(" · ")}. Medición orientativa; validar antes de tallar. (${fecha})`;
    // se agrega a la nota existente, sin borrarla
    const nota = (node.note && node.note.trim() ? node.note.trim() + "\n\n" : "") + dpLinea;

    // El metafield guarda SOLO el total (para la nota de venta / invoice), sin confundir.
    // El detalle completo (OD/OI/cerca/fiabilidad) queda en la NOTA de la orden, para el taller.
    await shopify(
      `mutation($id:ID!, $note:String, $mf:[MetafieldInput!]){
        orderUpdate(input:{ id:$id, note:$note, metafields:$mf }){
          order{ id }
          userErrors{ field message }
        }
      }`,
      {
        id: node.id,
        note: nota,
        mf: [{ namespace: "buhu", key: "distancia_pupilar", type: "single_line_text_field", value: `${dp.total} mm` }]
      }
    );

    return res.json({ ok: true, order: node.name });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "servidor" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`medidor-dp-orden-api escuchando en ${PORT}`));
