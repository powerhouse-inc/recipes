import type { UpgradeManifest } from "document-model";
import { roleBasedAuthUpgradeManifest } from "./role-based-auth/upgrades/upgrade-manifest.js";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  roleBasedAuthUpgradeManifest,
];
