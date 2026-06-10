import type {
  PHBaseState,
  PHDocument,
  UpgradeDocumentAction,
  UpgradeManifest,
  UpgradeTransition,
} from "document-model";
import { createAction, operationFromAction } from "document-model";

/**
 * In production this logic lives in @powerhousedao/reactor
 * (DocumentModelRegistry.computeUpgradePath + applyUpgradeDocumentAction).
 * This recipe distills it so the mechanics are visible: document-model only
 * defines the UpgradeManifest types, it does not apply them.
 */

type AnyUpgradeManifest = UpgradeManifest<readonly number[]>;

/**
 * Ordered transitions to step from `fromVersion` to the manifest's latest
 * version. Every hop must be covered: a manifest with versions [1, 2, 3]
 * upgrades a v1 document by composing v2 then v3 — there is no shortcut.
 */
export function computeUpgradePath(
  manifest: AnyUpgradeManifest,
  fromVersion: number,
): UpgradeTransition[] {
  const versions = [...manifest.supportedVersions].sort((a, b) => a - b);
  const start = versions.indexOf(fromVersion);
  if (start === -1) {
    throw new Error(
      `Version ${fromVersion} of ${manifest.documentType} is not in supportedVersions [${versions.join(", ")}]`,
    );
  }
  return versions.slice(start + 1).map((toVersion) => {
    const transition = (
      manifest.upgrades as Record<string, UpgradeTransition | undefined>
    )[`v${toVersion}`];
    if (!transition) {
      throw new Error(
        `${manifest.documentType} has no upgrade transition to v${toVersion}`,
      );
    }
    return transition;
  });
}

/**
 * Upgrades a document to the manifest's latest version. Already-latest
 * documents are returned untouched — no transition runs, no operation is
 * recorded.
 *
 * The version stamp is deliberately NOT part of the upgrade reducers: they
 * only migrate the state shape, the applier owns the version bookkeeping.
 * Like the reactor, the version is written once after the last hop — the
 * transitions themselves compose without intermediate stamps.
 */
export function upgradeDocument<TTo extends PHBaseState = PHBaseState>(
  document: PHDocument<PHBaseState>,
  manifest: AnyUpgradeManifest,
): PHDocument<TTo> {
  const fromVersion = document.state.document.version;
  if (fromVersion === manifest.latestVersion) {
    return document as PHDocument<TTo>;
  }

  const action = createAction<UpgradeDocumentAction>(
    "UPGRADE_DOCUMENT",
    {
      model: manifest.documentType,
      fromVersion,
      toVersion: manifest.latestVersion,
      documentId: document.header.id,
    },
    undefined,
    undefined,
    "document",
  );

  let upgraded = document;
  for (const transition of computeUpgradePath(manifest, fromVersion)) {
    upgraded = transition.upgradeReducer(upgraded, action) as typeof upgraded;
  }
  upgraded = {
    ...upgraded,
    state: {
      ...upgraded.state,
      document: {
        ...upgraded.state.document,
        version: manifest.latestVersion,
      },
    },
    initialState: {
      ...upgraded.initialState,
      document: {
        ...upgraded.initialState.document,
        version: manifest.latestVersion,
      },
    },
  };

  // Record the upgrade next to the seeded CREATE_DOCUMENT/UPGRADE_DOCUMENT
  // ops in the document scope. Replay never re-executes this scope — the
  // operation is the durable record of when the migration happened, the
  // migration itself lives on in the patched initialState.
  const documentOps = upgraded.operations.document ?? [];
  const operation = operationFromAction(action, documentOps.length, 0, {
    documentId: upgraded.header.id,
    documentType: upgraded.header.documentType,
    scope: "document",
    branch: upgraded.header.branch,
    ordinal: 0,
  });

  return {
    ...upgraded,
    operations: {
      ...upgraded.operations,
      document: [...documentOps, operation],
    },
  } as unknown as PHDocument<TTo>;
}
