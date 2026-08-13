// ============================================================
// Serveur HTTP minimal de health-check.
//
// Fly.io (fly.toml [http_service]) et Render (render.yaml type: web)
// s'attendent tous les deux à ce que le process écoute sur un port HTTP
// et réponde aux sondes de santé — sinon la plateforme considère le
// déploiement défaillant et redémarre/arrête la machine, ce qui tue au
// passage toute session vocale active. Voir
// docs/adr/0002-serveur-http-de-health-check.md.
// ============================================================

const http = require("http");

function startHealthServer(client) {
  const port = process.env.PORT || 8080;

  const server = http.createServer((req, res) => {
    const ready = client.isReady();
    res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: ready ? "ok" : "starting",
        bot: ready ? client.user.tag : null,
        uptimeSeconds: Math.floor(process.uptime()),
      })
    );
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`🌐 Serveur de health-check à l'écoute sur 0.0.0.0:${port}`);
  });

  return server;
}

module.exports = { startHealthServer };
