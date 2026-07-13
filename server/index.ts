import { loadEnv } from "./loadEnv";

loadEnv();

const { warnOnMissingConfig: warnOnMissingPayfastConfig } = await import("./payfast/config");
const { startServer } = await import("./app");

warnOnMissingPayfastConfig();
await startServer();
