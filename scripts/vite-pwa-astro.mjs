import { fileURLToPath } from "node:url";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Bridges vite-plugin-pwa into Astro server builds without depending on the
 * discontinued @vite-pwa/astro wrapper, whose peer range stops at Astro 5.
 */
export default function vitePwaAstro(options = {}) {
  let api;
  let shouldGenerate = false;

  return {
    name: "eventiapp:vite-pwa-astro",
    hooks: {
      "astro:config:setup": ({ command, config, updateConfig }) => {
        if (command === "preview" || command === "sync") return;

        const pwaOptions = { ...options };
        if (config.output === "server") {
          pwaOptions.outDir = fileURLToPath(config.build.client);
        }

        const workbox = { ...(pwaOptions.workbox ?? {}) };
        if (config.output === "server") {
          workbox.globDirectory = pwaOptions.outDir;
        }
        pwaOptions.workbox = workbox;

        let plugins = VitePWA(pwaOptions).filter(
          (plugin) => plugin.name !== "vite-plugin-pwa:build",
        );
        if (command === "build") {
          plugins = plugins.filter(
            (plugin) => plugin.name !== "vite-plugin-pwa:dev-sw",
          );
          plugins.push({
            name: "eventiapp:vite-pwa-client-build",
            applyToEnvironment(environment) {
              return environment.name === "client";
            },
            configResolved(resolvedConfig) {
              if (!resolvedConfig.build.ssr) {
                api = resolvedConfig.plugins
                  .flat(Number.POSITIVE_INFINITY)
                  .find((plugin) => plugin.name === "vite-plugin-pwa")?.api;
              }
            },
            async generateBundle(_, bundle) {
              const assets = await api?.pwaAssetsGenerator?.();
              if (assets) assets.injectManifestIcons();
              api?.generateBundle(bundle, this);
            },
          });
        }

        updateConfig({ vite: { plugins } });
      },
      "astro:build:done": async () => {
        shouldGenerate = true;
        if (shouldGenerate && api && !api.disabled) await api.generateSW();
      },
    },
  };
}
