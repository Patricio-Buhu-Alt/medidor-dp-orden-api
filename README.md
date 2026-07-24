# Medidor DP → Orden (mini-endpoint)

Servicio pequeñito que recibe la DP que el cliente midió + su **N° de orden** + **email**, verifica en Shopify que la orden sea suya (el email debe coincidir) y **escribe la DP en la orden**: como **nota** (detalle completo OD/OI/cerca/fiabilidad, para el taller) y como **metafield** `buhu.distancia_pupilar` (solo el **total**, ej. `62.5 mm`, tipo `single_line_text_field` — pensado para la nota de venta / invoice; ver `INDICACION-Invoices-metafield-DP.md`).

Es la pieza de backend que la herramienta (`medidor-dp/index.html`) necesita para el botón **"Guardar en mi orden"**. Las credenciales de Shopify viven **solo aquí** (nunca en el navegador).

> **Autenticación (modelo Dev Dashboard 2025):** Shopify ya no entrega un token estático `shpat_` en el admin. La app da un **Client ID** y un **Client Secret (`shpss_…`)**, y este servicio los intercambia por un access token de 24 h mediante **client credentials grant** (lo cachea y renueva solo). Requisito: la app y la tienda deben estar en la **misma organización** del Dev Dashboard, y la app **instalada** con los scopes.

---

## Paso 1 — Credenciales y scopes de la app (ya la creaste: "distancia-pupilar")

1. En el **Dev Dashboard** abre tu app `distancia-pupilar` → **Settings**.
2. Copia **Client ID** y **Client secret** (`shpss_…`). *(El "token de automatización" es solo para CI/CD — no se usa acá.)*
3. Confirma los **access scopes** de la app: `read_orders` y `write_orders`. *(Para órdenes de más de 60 días, además `read_all_orders`.)*
4. Asegúrate de que la app esté **instalada** en `buhu-cl.myshopify.com` y que la tienda aparezca en la **misma organización** del Dev Dashboard (si no, el token da `shop_not_permitted`).

## Paso 2 — Desplegar en Render

Puedes crear un servicio nuevo o agregar esta carpeta a tu Render existente.

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Variables de entorno** (ver `.env.example`):
  - `SHOPIFY_STORE` = `buhu-cl.myshopify.com`
  - `SHOPIFY_CLIENT_ID` = tu Client ID
  - `SHOPIFY_CLIENT_SECRET` = tu `shpss_…`
  - `API_VERSION` = `2024-10`
  - `ALLOWED_ORIGIN` = `https://patricio-buhu-alt.github.io,https://www.buhu.cl,https://buhu.cl`

Al terminar tendrás una URL, p. ej. `https://medidor-dp-orden-api.onrender.com`.
**El endpoint es esa URL + `/dp`.** Prueba de salud: abre la URL raíz → `{"ok":true,"service":"medidor-dp-orden-api"}`.

## Paso 3 — Conectar la herramienta

En `medidor-dp/index.html`, arriba en la sección CONFIG, pega tu URL:

```js
const ORDER_API_URL = "https://medidor-dp-orden-api.onrender.com/dp";
```

Haz `git add -A && git commit && git push`. Al recargar, la hoja de resultado mostrará el bloque **"Guardar en mi orden"** (si `ORDER_API_URL` está vacío, el bloque queda oculto).

## Paso 4 — Probar

1. Mide tu DP en la herramienta.
2. Pon el N° de una orden real y el email de esa compra.
3. Revisa la orden en Shopify: verás la **nota** con la DP y el **metafield** `buhu.distancia_pupilar`.

---

## Respuestas del endpoint (`POST /dp`)

Body: `{ order, email, total, od, oi, cerca, fiabilidad }`

- `200 { ok:true, order:"#1234" }` — guardado.
- `404 { ok:false, error:"orden_no_encontrada" }`
- `403 { ok:false, error:"email_no_coincide" }`
- `400 { ok:false, error:"falta_orden" | "falta_email" | "falta_dp" }`

## Notas de seguridad y datos

- El **Client Secret** solo está en las variables de entorno de Render; el navegador nunca lo ve. Nunca lo subas al repo (`.gitignore` incluye `.env`).
- El access token de 24 h se pide y cachea en memoria del servidor; se renueva solo.
- La verificación **orden + email** evita que alguien escriba DP en pedidos ajenos.
- La DP se deriva de la cámara/rostro (dato sensible bajo la **Ley 21.719**): la medición ocurre **en el dispositivo** y aquí solo viaja el número (mm), asociado a una orden que el propio cliente identifica. Minimiza lo que guardas y no lo uses para otra cosa.

## Solución de problemas

- **`shop_not_permitted`** al pedir el token → la app y la tienda no están en la misma organización del Dev Dashboard. Revisa que `buhu-cl.myshopify.com` figure entre las tiendas de tu organización.
- **`401/403` en las llamadas** → faltan scopes (`read_orders`/`write_orders`) o la app no está instalada.
- **`orden_no_encontrada`** con órdenes viejas → agrega el scope `read_all_orders` (órdenes de +60 días).
