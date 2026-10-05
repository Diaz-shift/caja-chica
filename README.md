# Caja Chica

Panel personal. Los datos se publican **cifrados** (AES-256-GCM, clave derivada con PBKDF2 de
600.000 rondas): sin la clave, `data.enc.json` es ilegible. Se actualiza solo a las 7:00 am y
7:00 pm (Caracas) desde un Google Sheet privado.
