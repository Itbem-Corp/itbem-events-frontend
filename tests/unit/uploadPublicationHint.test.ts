import { describe, expect, it } from "vitest";

import {
  normalizePublicMomentUploadResponse,
  publicMomentUploadOutcome,
  shouldShowProcessingStub,
} from "../../src/lib/publicMoments";
import {
  mergeUploadPublicationHint,
  sharedUploadSuccessCopy,
  shouldShowOptimizingTransition,
  uploadHintForMoment,
} from "../../src/lib/uploadPublicationHint";

const failedResponse = {
  data: {
    id: "m1",
    approval_status: "approved",
    publication_status: "failed",
    processing_status: "pending",
  },
};

describe("upload publication hint (PUB-1)", () => {
  it("recognises a failed publication even when the moment is approved", () => {
    const moment = normalizePublicMomentUploadResponse(failedResponse);
    expect(moment?.publication_status).toBe("failed");
    expect(uploadHintForMoment(moment)).toBe("failed");
  });

  it("keeps the existing hints", () => {
    expect(uploadHintForMoment({ id: "a", publication_status: "published" } as never)).toBe(
      "published",
    );
    expect(uploadHintForMoment({ id: "a", approval_status: "approved" } as never)).toBe(
      "processing",
    );
    expect(uploadHintForMoment(null)).toBe("pending_review");
  });

  it("lets a failed file dominate the batch", () => {
    expect(mergeUploadPublicationHint("published", "failed")).toBe("failed");
    expect(mergeUploadPublicationHint("failed", "published")).toBe("failed");
    expect(mergeUploadPublicationHint("pending_review", "failed")).toBe("failed");
    expect(mergeUploadPublicationHint("published", "processing")).toBe("processing");
    expect(mergeUploadPublicationHint("processing", "pending_review")).toBe(
      "pending_review",
    );
  });

  it("skips the optimizing delay for failed batches", () => {
    expect(shouldShowOptimizingTransition("failed")).toBe(false);
    expect(shouldShowOptimizingTransition("processing")).toBe(true);
  });

  it("uses warning copy without promising the wall", () => {
    const copy = sharedUploadSuccessCopy("failed", 1);
    expect(copy.tone).toBe("warning");
    expect(copy.message).toMatch(/^Recibimos tu archivo, pero no pudimos procesarlo/);
    expect(copy.message).not.toMatch(/aprobad|aparecerá en cuanto/);
    expect(copy.title).not.toMatch(/¡/);
    expect(sharedUploadSuccessCopy("failed", 3).message).toMatch(/^Recibimos tus archivos/);
  });

  it("keeps success copy for the other hints", () => {
    expect(sharedUploadSuccessCopy("published", 2)).toMatchObject({
      tone: "success",
      title: "¡2 momentos compartidos!",
    });
  });

  it("the personal upload on the wall also warns and adds no processing stub", () => {
    const moment = normalizePublicMomentUploadResponse(failedResponse);
    expect(publicMomentUploadOutcome(moment)).toMatchObject({ tone: "warning" });
    expect(publicMomentUploadOutcome(moment).message).toMatch(/no pudimos procesarlo/);
    expect(shouldShowProcessingStub(moment)).toBe(false);
  });
});
