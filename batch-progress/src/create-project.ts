import { createDocumentAction, type IReactor } from "@powerhousedao/reactor";
import { generateId } from "document-model";
import { addFile } from "document-drive";

export const JOB_KEYS = ["budget", "scope", "project", "drive"] as const;
export type JobKey = (typeof JOB_KEYS)[number];

export type ProjectIds = {
  budgetId: string;
  scopeId: string;
  projectId: string;
};

/**
 * Builds an `executeBatch` request that creates a project with three
 * documents (budget, scope, project) and registers them in a drive.
 *
 * Dependency graph:
 *
 *   budget ──┐
 *             ├──► project ──► drive (add files)
 *   scope  ──┘
 *
 * Budget and scope run in parallel. Project waits for both.
 * The drive step adds all three as files after project completes.
 */
export function buildCreateProjectBatch(driveId: string): {
  request: Parameters<IReactor["executeBatch"]>[0];
  ids: ProjectIds;
} {
  const budgetId = generateId();
  const scopeId = generateId();
  const projectId = generateId();

  const request: Parameters<IReactor["executeBatch"]>[0] = {
    jobs: [
      {
        key: "budget",
        documentId: budgetId,
        scope: "document",
        branch: "main",
        actions: [
          createDocumentAction({
            documentId: budgetId,
            model: "powerhouse/document-model",
            version: 0,
          }),
        ],
        dependsOn: [],
      },
      {
        key: "scope",
        documentId: scopeId,
        scope: "document",
        branch: "main",
        actions: [
          createDocumentAction({
            documentId: scopeId,
            model: "powerhouse/document-model",
            version: 0,
          }),
        ],
        dependsOn: [],
      },
      {
        key: "project",
        documentId: projectId,
        scope: "document",
        branch: "main",
        actions: [
          createDocumentAction({
            documentId: projectId,
            model: "powerhouse/document-model",
            version: 0,
          }),
        ],
        dependsOn: ["budget", "scope"],
      },
      {
        key: "drive",
        documentId: driveId,
        scope: "global",
        branch: "main",
        actions: [
          addFile({
            id: budgetId,
            name: "Budget",
            documentType: "powerhouse/document-model",
          }),
          addFile({
            id: scopeId,
            name: "Scope",
            documentType: "powerhouse/document-model",
          }),
          addFile({
            id: projectId,
            name: "Project",
            documentType: "powerhouse/document-model",
          }),
        ],
        dependsOn: ["project"],
      },
    ],
  };

  return { request, ids: { budgetId, scopeId, projectId } };
}
