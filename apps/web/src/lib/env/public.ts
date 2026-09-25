import "server-only";
import { readRuntimeConfig } from "./runtime";
export function readPublicConfig() {
  return readRuntimeConfig(process.env);
}
