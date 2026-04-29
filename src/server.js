import app from "./app.js";
import { config, resolvePublicBaseUrl } from "./config.js";

const publicBaseUrl = resolvePublicBaseUrl();

app.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`AI4K12 MVP service running at ${publicBaseUrl} (bind ${config.host}:${config.port})`);
});

