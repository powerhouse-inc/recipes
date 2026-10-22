// The package entry ph-cli builds. This recipe adds only routes, which ph-cli
// collects from hosts/connect/routes/, so it ships no document models or editors.
import type { Manifest } from "document-model";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };

export const documentModels = [];
export const editors = [];
export const manifest: Manifest = manifestJson;
