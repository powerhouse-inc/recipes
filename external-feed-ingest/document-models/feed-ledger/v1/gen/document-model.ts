import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/feed-ledger",
  name: "Feed Ledger",
  extension: "ledger",
  description:
    "Append-only ledger of entries ingested from an external feed, with a per-source high-watermark and explicit supersede operations",
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type FeedLedgerState {\n  source: String!\n  watermark: Int!\n  entries: [LedgerEntry!]!\n}\n\ntype LedgerEntry {\n  externalId: String!\n  sequence: Int!\n  payload: String!\n  recordedAt: String!\n  status: LedgerEntryStatus!\n  supersededBy: String\n}\n\nenum LedgerEntryStatus {\n  RECORDED\n  SUPERSEDED\n}",
          initialValue: '{"source":"","watermark":0,"entries":[]}',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: "",
          examples: [],
        },
      },
      modules: [
        {
          id: "b2c3d4e5-1111-4a2b-8c3d-000000000001",
          name: "ingest",
          description: "Idempotent feed-ingestion operations.",
          operations: [
            {
              id: "b2c3d4e5-1111-4a2b-8c3d-000000000010",
              name: "RECORD_ENTRY",
              description:
                "Append a new feed entry and advance the watermark to its sequence.",
              schema:
                "input RecordEntryInput {\n  externalId: String!\n  sequence: Int!\n  payload: String!\n  ts: String!\n}",
              template: "",
              reducer:
                'if (state.entries.some((e) => e.externalId === action.input.externalId)) {\n  throw new DuplicateEntry(`entry ${action.input.externalId} already recorded`);\n}\nstate.entries.push({\n  externalId: action.input.externalId,\n  sequence: action.input.sequence,\n  payload: action.input.payload,\n  recordedAt: action.input.ts,\n  status: "RECORDED",\n  supersededBy: null,\n});\nstate.watermark = Math.max(state.watermark, action.input.sequence);',
              errors: [
                {
                  id: "duplicateEntry",
                  name: "DuplicateEntry",
                  code: "DUPLICATE_ENTRY",
                  description:
                    "An entry with this externalId is already recorded",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "b2c3d4e5-1111-4a2b-8c3d-000000000011",
              name: "MARK_SUPERSEDED",
              description:
                "Mark an existing entry SUPERSEDED and append the corrected value as a new entry.",
              schema:
                "input MarkSupersededInput {\n  supersededId: String!\n  externalId: String!\n  sequence: Int!\n  payload: String!\n  ts: String!\n}",
              template: "",
              reducer:
                'const target = state.entries.find((e) => e.externalId === action.input.supersededId);\nif (!target || target.status === "SUPERSEDED") {\n  throw new UnknownEntry(`cannot supersede unknown or already-superseded entry ${action.input.supersededId}`);\n}\nif (state.entries.some((e) => e.externalId === action.input.externalId)) {\n  throw new DuplicateEntry(`correction ${action.input.externalId} already recorded`);\n}\ntarget.status = "SUPERSEDED";\ntarget.supersededBy = action.input.externalId;\nstate.entries.push({\n  externalId: action.input.externalId,\n  sequence: action.input.sequence,\n  payload: action.input.payload,\n  recordedAt: action.input.ts,\n  status: "RECORDED",\n  supersededBy: null,\n});\nstate.watermark = Math.max(state.watermark, action.input.sequence);',
              errors: [
                {
                  id: "unknownEntry",
                  name: "UnknownEntry",
                  code: "UNKNOWN_ENTRY",
                  description:
                    "The entry to supersede does not exist or is already superseded",
                  template: "",
                },
                {
                  id: "duplicateEntry",
                  name: "DuplicateEntry",
                  code: "DUPLICATE_ENTRY",
                  description: "The correction externalId is already recorded",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};
