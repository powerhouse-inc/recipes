/**
 * The checklist document model. `Checklist` is a `DocumentModelModule`: a
 * reactor registers it, and `reducer`, `actions` and `utils` work as they do
 * for a generated model.
 */
import {
  defineDocumentModelFamily,
  latestVersionOf,
  materialize,
  type UpgradeManifest,
} from "document-model";
import { checklistConfig, checklistModel } from "./definition.js";
import { checklistItems } from "./modules/items.js";

const supportedVersions = [1] as const;

const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: checklistConfig.id,
  latestVersion: latestVersionOf(supportedVersions),
  supportedVersions,
  upgrades: {},
};

const family = materialize(
  defineDocumentModelFamily({
    versions: [checklistModel.version({ modules: [checklistItems] })],
    upgradeManifest,
  }),
);

export const Checklist = family.at(1);
