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

const i = process.argv.indexOf("--desde");
if (i > 0) {
  const d = JSON.parse(fs.readFileSync(process.argv[i + 1], "utf8"));
  fs.writeFileSync("data.enc.json", JSON.stringify(cifrar(d)));
  console.log("data.enc.json sembrado con", d.movimientos.length, "movimientos");
} else {
  fs.mkdirSync("sitio", { recursive: true });
  fs.copyFileSync("index.html", "sitio/index.html");
  const d = await datosDelSheet();
  if (d) {
    fs.writeFileSync("sitio/data.enc.json", JSON.stringify(cifrar(d)));
    console.log("Datos frescos del Sheet:", d.movimientos.length, "movimientos");
  } else {
    fs.copyFileSync("data.enc.json", "sitio/data.enc.json");
    console.log("Sin SHEET_URL todavía: publico la última semilla cifrada");
  }
  fs.writeFileSync("sitio/.nojekyll", "");
}
