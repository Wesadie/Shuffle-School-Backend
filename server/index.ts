import { loadEnv } from "./loadEnv";
import { validatePayfastConfig } from "./payfast/config";

loadEnv();
validatePayfastConfig();

void import("./app");
