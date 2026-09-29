// C10 — which spellings of a DENIED route does staging's OWN Express route to its handler?
// Run on staging, as an unprivileged account, against the installed express:
//   node c10_express_variants.js /home/deploy/dawntrader/node_modules/express
// It mirrors the app's shape: a bare express.Router() (routes.ts creates one) mounted at /api
// with app.use (index.ts). Each denied route answers "HIT <route>"; anything else is a 404.
// Output: one line per variant — HIT (Express would run the handler) or MISS.
const express = require(process.argv[2]);
const http = require("http");

const ROUTES = [
  ["post", "/trading/set-mode"],
  ["post", "/kill-switch/reset"],
  ["post", "/guardrails-v2/kill-switch/reset"],
  ["get", "/user/profile"],
  ["get", "/system/formula-audit"],
];
const app = express();
const r = express.Router();
for (const [m, p] of ROUTES) r[m](p, (req, res) => res.status(200).send("HIT " + p));
r.all("*", (req, res) => res.status(404).send("MISS"));
app.use("/api", r);

function variants(p) {
  const up = p.toUpperCase();
  return [
    "/api" + p, "/api" + p + "/", "/API" + up, "/Api" + p, "/api" + p + "/.", "/api" + p + "/./",
    "/api" + p + "/x/..", "/api/." + p, "/api/" + p, "/api" + p.replace("-", "%2d"),
    "/api" + p.replace("/", "/%2f").replace("/%2f", "/", 1), "/api" + p + "?x=1", "/api" + p + "/?x=1",
    "/api" + p + ";x", "/api" + p + "%20", "/api" + p + "//", "//api" + p, "/api" + p + "#x",
    "/api" + p.replace("s", "ſ"),
  ];
}

const srv = app.listen(0, "127.0.0.1", async () => {
  const port = srv.address().port;
  const send = (method, path) => new Promise((res) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, insecureHTTPParser: false }, (rs) => {
      let b = ""; rs.on("data", (d) => (b += d)); rs.on("end", () => res(rs.statusCode + " " + b));
    });
    req.on("error", (e) => res("ERR " + e.code));
    req.end();
  });
  for (const [m, p] of ROUTES) {
    for (const v of variants(p)) {
      let out;
      try { out = await send(m.toUpperCase(), v); } catch (e) { out = "ERR " + e.message; }
      console.log((out.startsWith("200 HIT") ? "HIT " : "MISS") + "  " + m.toUpperCase() + " " + JSON.stringify(v) + "  -> " + out.slice(0, 40));
    }
  }
  srv.close();
});
