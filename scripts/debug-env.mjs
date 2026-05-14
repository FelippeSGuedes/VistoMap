import pkg from "@next/env";
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

const pw = process.env.GLPI_DB_PASSWORD ?? "";
console.log("GLPI_DB_HOST   =", JSON.stringify(process.env.GLPI_DB_HOST));
console.log("GLPI_DB_USER   =", JSON.stringify(process.env.GLPI_DB_USER));
console.log("GLPI_DB_NAME   =", JSON.stringify(process.env.GLPI_DB_NAME));
console.log("GLPI_DB_PASSWORD raw =", JSON.stringify(pw));
console.log("GLPI_DB_PASSWORD length =", pw.length);
console.log(
  "GLPI_DB_PASSWORD chars =",
  Array.from(pw).map((c) => c.charCodeAt(0))
);
