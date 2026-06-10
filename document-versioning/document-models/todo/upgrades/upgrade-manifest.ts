import type { UpgradeManifest } from "document-model";
import { todoDocumentType } from "../document-type.js";
import { v2 } from "./v2.js";
import { latestVersion, supportedVersions } from "./versions.js";

/**
 * Declares every schema version this model supports and how to step between
 * them. The `upgrades` map holds one transition per version after 1 (`v2`,
 * `v3`, ...) — every hop must be covered, transitions compose sequentially.
 */
export const todoUpgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: todoDocumentType,
  latestVersion,
  supportedVersions,
  upgrades: { v2 },
};
