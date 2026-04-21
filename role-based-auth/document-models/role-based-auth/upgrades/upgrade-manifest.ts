import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";

export const roleBasedAuthUpgradeManifest: UpgradeManifest<
  typeof supportedVersions
> = {
  documentType: "powerhouse/role-based-auth",
  latestVersion,
  supportedVersions,
  upgrades: {},
};
