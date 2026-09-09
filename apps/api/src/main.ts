import { buildContext, createApiServer } from "./server.js";

const port = Number(process.env["PORT"] ?? 4114);
const ctx = await buildContext();
createApiServer(ctx).listen(port, () => {
  console.log(`SysML–FHIR Bridge API listening on http://localhost:${port}/v1/traces`);
});
