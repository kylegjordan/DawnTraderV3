import type { Express } from "express";
import listEndpoints from "express-list-endpoints";
import fs from "fs";
import path from "path";

export function printRoutes(app: Express) {
  const routes: string[] = [];
  
  function collect(layer: any, prefix = "") {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).join(",").toUpperCase();
      routes.push(`${methods.padEnd(6)} ${prefix}${layer.route.path}`);
    } else if (layer.name === "router" && layer.handle?.stack) {
      layer.handle.stack.forEach((l: any) => collect(l, prefix));
    }
  }
  
  // @ts-ignore
  (app as any)._router?.stack?.forEach((l: any) => collect(l, ""));
  
  console.log("[ROUTES]");
  console.log(routes.sort().join("\n"));
  console.log(`[ROUTES] Total: ${routes.length} endpoints`);
}

export function dumpRoutes(app: Express) {
  const routes = listEndpoints(app);
  const diagnosticsDir = path.join(process.cwd(), "diagnostics");
  
  if (!fs.existsSync(diagnosticsDir)) {
    fs.mkdirSync(diagnosticsDir, { recursive: true });
  }
  
  const outputPath = path.join(diagnosticsDir, "phase2f_route_manifest.json");
  fs.writeFileSync(outputPath, JSON.stringify(routes, null, 2));
  
  console.log(`[ROUTES_DUMP] Wrote ${routes.length} endpoints to ${outputPath}`);
  
  const userIdRoutes = routes.filter(r => r.path.includes(":userId"));
  if (userIdRoutes.length > 0) {
    console.log(`[ROUTES_DUMP] ⚠️ Found ${userIdRoutes.length} routes with :userId:`);
    userIdRoutes.forEach(r => console.log(`  - ${r.methods.join(",")} ${r.path}`));
  } else {
    console.log(`[ROUTES_DUMP] ✅ No :userId routes found`);
  }
}
