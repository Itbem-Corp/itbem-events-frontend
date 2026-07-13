export type SharedUploadEngineModule =
  typeof import("./SharedUploadEngine");

type EngineImporter<T> = () => Promise<T>;

export interface SharedUploadEngineLoader<T> {
  load: () => Promise<T>;
  loadForAction: () => Promise<T>;
  preload: () => void;
}

/**
 * Keeps every intent signal and the eventual submit on the same import promise.
 * A failed speculative request is cleared so the explicit action can retry.
 */
export function createSharedUploadEngineLoader<T>(
  importer: EngineImporter<T>,
): SharedUploadEngineLoader<T> {
  let pending: Promise<T> | null = null;

  const load = (): Promise<T> => {
    if (!pending) {
      pending = importer().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  return {
    load,
    loadForAction: async () => {
      try {
        return await load();
      } catch {
        // If an in-flight speculative import failed, retry once while the user
        // action still owns the selected File objects.
        return load();
      }
    },
    preload: () => {
      void load().catch(() => {
        // The explicit selection or submit path retries after a speculative failure.
      });
    },
  };
}

const sharedUploadEngineLoader = createSharedUploadEngineLoader(
  () => import("./SharedUploadEngine"),
);

export const loadSharedUploadEngine = sharedUploadEngineLoader.load;
export const loadSharedUploadEngineForAction =
  sharedUploadEngineLoader.loadForAction;
export const preloadSharedUploadEngine = sharedUploadEngineLoader.preload;
