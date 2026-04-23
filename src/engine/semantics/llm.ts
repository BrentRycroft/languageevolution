/**
 * WebLLM-backed semantic neighbor generator.
 *
 * Loads a small in-browser LLM (default: Gemma 2 2B, quantized) lazily on
 * demand. For each meaning in the lexicon, asks the model for 3 semantically
 * related concepts, caches the results in IndexedDB, and returns them
 * synchronously thereafter.
 *
 * The simulation engine remains deterministic: we pre-fill the cache before
 * enabling AI drift, then the engine just looks up neighbors by key.
 */

const CACHE_DB = "lev-ai-cache";
const CACHE_STORE = "neighbors";

export interface LlmConfig {
  modelId: string;
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  // Ministral 3B Instruct, 2512 release, quantized q4f16_1 with BF16
  // residual. Confirmed against @mlc-ai/web-llm's prebuiltAppConfig in
  // this repo's node_modules. Previous id ("Ministral-3B-Instruct-
  // 2410-q4f16_1-MLC") is not in the prebuilt list and throws a
  // "Cannot find model record in appConfig" error on download.
  modelId: "Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC",
};

/**
 * Check whether the configured model id is actually present in WebLLM's
 * prebuiltAppConfig. We do this before triggering a download so the UI
 * can show a clear error instead of the cryptic "Cannot find model
 * record in appConfig" that WebLLM throws at load time.
 * Returns null if validation succeeds, or an error string otherwise.
 */
export async function validateModelAvailable(
  config: LlmConfig = DEFAULT_LLM_CONFIG,
): Promise<string | null> {
  try {
    const mod = await import("@mlc-ai/web-llm");
    const prebuilt = (mod as unknown as {
      prebuiltAppConfig?: { model_list?: Array<{ model_id: string }> };
    }).prebuiltAppConfig;
    const ids = prebuilt?.model_list?.map((m) => m.model_id) ?? [];
    if (ids.length === 0) return null; // if we can't read the list, let WebLLM try.
    if (!ids.includes(config.modelId)) {
      return `Model "${config.modelId}" is not in the installed WebLLM's prebuilt list. Available Ministral ids: ${ids.filter((i) => i.includes("Ministral")).join(", ") || "none"}.`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Expose the engine loader so other AI-backed features (translation,
 * grammar sketch, rule-bias suggestion) can share a single engine
 * instance without rewrapping initialisation logic.
 */
export async function loadEngine(
  config: LlmConfig = DEFAULT_LLM_CONFIG,
  onProgress?: ProgressCallback,
): Promise<EngineLike> {
  return getEngine(config, onProgress);
}

/**
 * Single-shot prompt helper for features that want one response rather
 * than a neighbor list. Thin wrapper around the raw chat API.
 */
export async function chatOnce(
  prompt: string,
  opts: { maxTokens?: number; temperature?: number; config?: LlmConfig } = {},
): Promise<string> {
  const engine = await getEngine(opts.config ?? DEFAULT_LLM_CONFIG);
  const res = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 200,
  });
  return res.choices[0]?.message.content ?? "";
}

export interface ProgressCallback {
  (info: { text: string; progress: number }): void;
}

async function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(CACHE_STORE);
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function cacheGet(key: string): Promise<string[] | null> {
  try {
    const db = await openCache();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readonly");
      const req = tx.objectStore(CACHE_STORE).get(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result ?? null);
    });
  } catch {
    return null;
  }
}

async function cachePut(key: string, value: string[]): Promise<void> {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      tx.objectStore(CACHE_STORE).put(value, key);
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
  } catch {
    // best-effort cache
  }
}

interface EngineLike {
  chat: {
    completions: {
      create: (req: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }>;
    };
  };
}

let enginePromise: Promise<EngineLike> | null = null;

/**
 * Lazy-load the WebLLM engine. Uses a dynamic import so the bundle only
 * pulls webllm when the user actually turns on AI drift.
 */
async function getEngine(config: LlmConfig, onProgress?: ProgressCallback): Promise<EngineLike> {
  if (!enginePromise) {
    enginePromise = (async () => {
      let mod: typeof import("@mlc-ai/web-llm");
      try {
        mod = await import("@mlc-ai/web-llm");
      } catch (err) {
        // If the WebLLM chunk fetch fails (network, SW misroute, CORS,
        // anything), the default dynamic-import error message is opaque
        // and — critically — was previously being intercepted by the
        // PWA's navigateFallback rule, which served `index.html` in its
        // place and triggered a full page reload that wiped the running
        // simulation. We reset the cached promise and re-throw with a
        // user-legible message so the UI can surface it via aiStatus.
        enginePromise = null;
        throw new Error(
          `Could not load the WebLLM runtime (${(err as Error).message}). Check your network; the AI module is ~6 MB.`,
        );
      }
      try {
        const engine = await mod.CreateMLCEngine(config.modelId, {
          initProgressCallback: (info: { text: string; progress: number }) => {
            onProgress?.(info);
          },
        });
        return engine as unknown as EngineLike;
      } catch (err) {
        // Model initialisation failure (bad model id, WebGPU missing,
        // storage quota exhausted, etc.). Clear the cached promise so
        // the user can retry once they've addressed the underlying
        // issue without hitting the stale rejection.
        enginePromise = null;
        throw err;
      }
    })();
  }
  return enginePromise;
}

function parseNeighbors(raw: string): string[] {
  return raw
    .split(/[\n,;]/)
    .map((s) => s.trim().toLowerCase())
    .map((s) => s.replace(/^[\d\-.*)(\s]+/, ""))
    .map((s) => s.replace(/[^a-z-]/g, ""))
    .filter((s) => s.length > 0 && s.length <= 20);
}

async function askLLM(engine: EngineLike, meaning: string): Promise<string[]> {
  const prompt = `Give three short single-word concepts semantically related to "${meaning}".
Return them as a comma-separated list, lowercase, no numbering, no explanation.
Example: for "water" you might return: river, drink, rain.`;
  const res = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 40,
  });
  const raw = res.choices[0]?.message.content ?? "";
  const neighbors = parseNeighbors(raw).filter((n) => n !== meaning);
  return neighbors.slice(0, 3);
}

/**
 * Populate neighbor cache for the given meanings. Calls onProgress per meaning.
 * The cache key is the meaning alone; neighbors are shared across languages.
 */
export async function prefillNeighbors(
  meanings: string[],
  config: LlmConfig,
  onProgress: ProgressCallback,
): Promise<Record<string, string[]>> {
  const engine = await getEngine(config, onProgress);
  const out: Record<string, string[]> = {};
  let done = 0;
  for (const m of meanings) {
    const cached = await cacheGet(m);
    if (cached && cached.length > 0) {
      out[m] = cached;
    } else {
      try {
        const neighbors = await askLLM(engine, m);
        if (neighbors.length > 0) {
          out[m] = neighbors;
          await cachePut(m, neighbors);
        }
      } catch {
        // Skip failures; drift will fall back to the static table for this meaning.
      }
    }
    done++;
    onProgress({
      text: `Generating semantic neighbors: ${done}/${meanings.length}`,
      progress: done / meanings.length,
    });
  }
  return out;
}

/**
 * Bulk-load whatever is already cached, without requiring the engine.
 * Useful on app boot to surface previously-generated neighbors immediately.
 */
export async function loadCachedNeighbors(meanings: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const m of meanings) {
    const cached = await cacheGet(m);
    if (cached && cached.length > 0) out[m] = cached;
  }
  return out;
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      tx.objectStore(CACHE_STORE).clear();
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
  } catch {
    // ignore
  }
}
