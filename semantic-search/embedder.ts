import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import { truncateForEmbedding, type EmbedFn } from "./utils.js";

/**
 * The real embedder: all-MiniLM-L6-v2 via Transformers.js (ONNX, quantized).
 * Runs fully in-process — no external API, no API key. The ~25 MB model
 * downloads from the HuggingFace Hub on first use and is cached under
 * .model-cache/ next to this file, so subsequent runs are offline.
 *
 * knowledge-note (the production proof of this stack) lazily `import()`s its
 * heavy deps so module registration succeeds even where they aren't
 * installed; in a Node-only recipe a plain import is fine — only the pipeline
 * itself is lazily initialized, once.
 */
const MODEL = "Xenova/all-MiniLM-L6-v2";

env.cacheDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".model-cache",
);

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractorPromise ??= pipeline("feature-extraction", MODEL, { dtype: "q8" });
  return extractorPromise;
}

export const embed: EmbedFn = async (text) => {
  const extractor = await getExtractor();
  const output = await extractor(truncateForEmbedding(text), {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output.data as Float32Array);
};
