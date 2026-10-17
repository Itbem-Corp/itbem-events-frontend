import { MOTION_TECHNIQUES, isTechniqueSupported, readMotionEnv } from "./motion";

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>;
  };
};

/**
 * Runs `update` inside a view transition on `element` (name set on tap, removed
 * when done). Without support, in conserve mode, or with reduced motion the
 * update runs directly: the caller's own fade or cut applies.
 */
export async function runViewTransition(
  element: HTMLElement | null,
  update: () => void | Promise<void>,
  name = "foto",
): Promise<void> {
  const doc = document as TransitionDocument;
  const env = readMotionEnv();
  const canAnimate =
    element !== null &&
    typeof doc.startViewTransition === "function" &&
    isTechniqueSupported(MOTION_TECHNIQUES.viewTransitions) &&
    !env.conserve;

  if (!canAnimate) {
    await update();
    return;
  }

  element.style.setProperty("view-transition-name", name);
  try {
    await doc.startViewTransition!(update).finished;
  } finally {
    element.style.removeProperty("view-transition-name");
  }
}
