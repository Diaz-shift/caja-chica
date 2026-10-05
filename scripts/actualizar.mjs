// Arma el sitio del panel: pide los datos al Sheet (Apps Script), los cifra y los deja en sitio/.
// Uso en GitHub Actions: node scripts/actualizar.mjs   (con SHEET_URL, SHEET_TOKEN y PANEL_CLAVE)
// Uso local para sembrar:  PANEL_CLAVE=... node scripts/actualizar.mjs --desde datos.json
import crypto from "node:crypto";
import fs from "node:fs";

const ITER = 600000;
const sal = fs.readFileSync(new URL("./sal.txt", import.meta.url), "utf8").trim();
const clave = process.env.PANEL_CLAVE;
if (!clave) throw new Error("Falta PANEL_CLAVE");

function cifrar(obj) {
  const key = crypto.pbkdf2Sync(clave, Buffer.from(sal, "base64"), ITER, 32, "sha256");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final(), c.getAuthTag()]);
  return { v: 1, iter: ITER, salt: sal, iv: iv.toString("base64"), ct: ct.toString("base64") };
}

async function datosDelSheet() {
  const url = process.env.SHEET_URL, token = process.env.SHEET_TOKEN;
  if (!url || !token) return null;
  const r = await fetch(url + "?token=" + encodeURIComponent(token), { redirect: "follow" });
  if (!r.ok) throw new Error("El Sheet respondió " + r.status);
  const d = await r.json();
  if (d.error) throw new Error("El Sheet rechazó la petición: " + d.error);
  if (!Array.isArray(d.movimientos)) throw new Error("Respuesta sin movimientos");
  return d;
}

function descifrar(env) {
  const key = crypto.pbkdf2Sync(clave, Buffer.from(env.salt, "base64"), env.iter, 32, "sha256");
  const raw = Buffer.from(env.ct, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString("utf8"));
}
// Las deudas no viven en el Sheet: Atenea las mantiene cifradas en deudas.enc.json.
function conDeudas(d) {
  if (fs.existsSync("deudas.enc.json")) d.deudas = descifrar(JSON.parse(fs.readFileSync("deudas.enc.json", "utf8")));
  return d;
}

const j = process.argv.indexOf("--deudas");
if (j > 0) {
  const dd = JSON.parse(fs.readFileSync(process.argv[j + 1], "utf8"));
  fs.writeFileSync("deudas.enc.json", JSON.stringify(cifrar(dd)));
  console.log("deudas.enc.json actualizado:", dd.items.length, "acreedores");
  process.exit(0);
}

const i = process.argv.indexOf("--desde");
if (i > 0) {
  const d = JSON.parse(fs.readFileSync(process.argv[i + 1], "utf8"));
  fs.writeFileSync("data.enc.json", JSON.stringify(cifrar(conDeudas(d))));
  console.log("data.enc.json sembrado con", d.movimientos.length, "movimientos");
} else {
  fs.mkdirSync("sitio", { recursive: true });
  fs.copyFileSync("index.html", "sitio/index.html");
  const d = await datosDelSheet();
  if (d) {
    fs.writeFileSync("sitio/data.enc.json", JSON.stringify(cifrar(conDeudas(d))));
    console.log("Datos frescos del Sheet:", d.movimientos.length, "movimientos");
  } else {
    fs.copyFileSync("data.enc.json", "sitio/data.enc.json");
    console.log("Sin SHEET_URL todavía: publico la última semilla cifrada");
  }
  fs.writeFileSync("sitio/.nojekyll", "");
}
