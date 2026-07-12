import { loadEnv } from "./loadEnv";
import { warnOnMissingConfig as warnOnMissingPayfastConfig } from "./payfast/config";

loadEnv();
warnOnMissingPayfastConfig();

void import("./app");
