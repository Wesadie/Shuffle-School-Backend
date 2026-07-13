import { loadEnv } from "./loadEnv";
import { startServer } from "./app";
import { warnOnMissingConfig as warnOnMissingPayfastConfig } from "./payfast/config";

loadEnv();
warnOnMissingPayfastConfig();

startServer();
