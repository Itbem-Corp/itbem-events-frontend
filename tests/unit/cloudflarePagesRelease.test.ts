import { describe, expect, it, vi } from "vitest";
// @ts-ignore -- the deployment CLI is native ESM JavaScript by design.
import {
  getCurrentProduction,
  getProductionDeployment,
  parseCanonicalProduction,
  redactSecrets,
  rollbackProduction,
} from "../../scripts/cloudflare-pages-release.mjs";

const config = {
  accountId: "account-id",
  apiToken: "do-not-print-this-token",
  projectName: "itbem-events-frontend",
};

type DeploymentOptions = {
  id?: string;
  environment?: string;
  status?: string;
  commitHash?: string;
  url?: string;
};

function deployment({
  id = "deployment-old",
  environment = "production",
  status = "success",
  commitHash = "abc123",
  url = `https://${id}.itbem-events-frontend.pages.dev`,
}: DeploymentOptions = {}) {
  return {
    id,
    environment,
    is_skipped: false,
    latest_stage: { status },
    deployment_trigger: { metadata: { commit_hash: commitHash } },
    url,
  };
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function projectEnvelope(canonicalDeployment: unknown) {
  return {
    success: true,
    errors: [],
    result: { canonical_deployment: canonicalDeployment },
  };
}

function deploymentEnvelope(value: unknown) {
  return { success: true, errors: [], result: value };
}

describe("Cloudflare Pages release contract", () => {
  it("captures only a successful canonical production deployment", () => {
    expect(parseCanonicalProduction(projectEnvelope(deployment()))).toEqual({
      id: "deployment-old",
      url: "https://deployment-old.itbem-events-frontend.pages.dev/",
    });
  });

  it.each([
    ["missing", null],
    ["preview", deployment({ environment: "preview" })],
    ["failed", deployment({ status: "failure" })],
  ])("fails closed for a %s canonical deployment", (_label, value) => {
    expect(() => parseCanonicalProduction(projectEnvelope(value))).toThrow();
  });

  it("verifies the exact production deployment and commit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(
        deploymentEnvelope(
          deployment({ id: "deployment-new", commitHash: "expected-sha" }),
        ),
      ),
    );

    await expect(
      getProductionDeployment(config, "deployment-new", "expected-sha", {
        fetchImpl,
      }),
    ).resolves.toMatchObject({ id: "deployment-new" });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/deployments/deployment-new"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: `Bearer ${config.apiToken}`,
        }),
      }),
    );
  });

  it("rejects a production deployment from another commit", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        response(deploymentEnvelope(deployment({ id: "deployment-new" }))),
      );

    await expect(
      getProductionDeployment(config, "deployment-new", "different-sha", {
        fetchImpl,
      }),
    ).rejects.toThrow("expected different-sha");
  });

  it("does not POST when the rollback target is already canonical", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response(projectEnvelope(deployment())));

    await expect(
      rollbackProduction(config, "deployment-old", { fetchImpl }),
    ).resolves.toMatchObject({ changed: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].method).toBe("GET");
  });

  it("rolls back and verifies the canonical deployment", async () => {
    const oldDeployment = deployment();
    const newDeployment = deployment({ id: "deployment-new" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(projectEnvelope(newDeployment)))
      .mockResolvedValueOnce(response(deploymentEnvelope(oldDeployment)))
      .mockResolvedValueOnce(response(projectEnvelope(oldDeployment)));

    await expect(
      rollbackProduction(config, "deployment-old", {
        fetchImpl,
        pollDelayMs: 0,
        sleepImpl: async () => {},
      }),
    ).resolves.toMatchObject({ changed: true });
    expect(fetchImpl.mock.calls.map((call) => call[1].method)).toEqual([
      "GET",
      "POST",
      "GET",
    ]);
    expect(fetchImpl.mock.calls[1][0]).toContain(
      "/deployments/deployment-old/rollback",
    );
  });

  it("resolves an ambiguous POST failure by checking canonical state", async () => {
    const oldDeployment = deployment();
    const newDeployment = deployment({ id: "deployment-new" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(projectEnvelope(newDeployment)))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(projectEnvelope(oldDeployment)));

    await expect(
      rollbackProduction(config, "deployment-old", {
        fetchImpl,
        pollDelayMs: 0,
        sleepImpl: async () => {},
      }),
    ).resolves.toMatchObject({ changed: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("still attempts rollback when the initial canonical lookup is unavailable", async () => {
    const oldDeployment = deployment();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary read failure"))
      .mockResolvedValueOnce(response(deploymentEnvelope(oldDeployment)))
      .mockResolvedValueOnce(response(projectEnvelope(oldDeployment)));

    await expect(
      rollbackProduction(config, "deployment-old", {
        fetchImpl,
        pollDelayMs: 0,
        sleepImpl: async () => {},
      }),
    ).resolves.toMatchObject({ changed: true });
    expect(fetchImpl.mock.calls.map((call) => call[1].method)).toEqual([
      "GET",
      "POST",
      "GET",
    ]);
  });

  it("fails closed when rollback never becomes canonical", async () => {
    const newDeployment = deployment({ id: "deployment-new" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(projectEnvelope(newDeployment)))
      .mockResolvedValueOnce(response(deploymentEnvelope(deployment())))
      .mockImplementation(() =>
        Promise.resolve(response(projectEnvelope(newDeployment))),
      );

    await expect(
      rollbackProduction(config, "deployment-old", {
        fetchImpl,
        pollAttempts: 2,
        pollDelayMs: 0,
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow("did not become canonical");
  });

  it("redacts tokens from arbitrary errors", () => {
    expect(
      redactSecrets(
        `request failed with Authorization: Bearer ${config.apiToken}`,
        [config.apiToken],
      ),
    ).toBe("request failed with Authorization: Bearer [REDACTED]");
  });

  it("never includes the API token in a failed request message", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(
        new Error(`network error for Bearer ${config.apiToken}`),
      );

    let error: unknown;
    try {
      await getCurrentProduction(config, { fetchImpl });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(config.apiToken);
    expect((error as Error).message).toContain("[REDACTED]");
  });

  it("redacts the API token from Cloudflare error payloads", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(
        {
          success: false,
          result: null,
          errors: [
            { code: 1000, message: `invalid Bearer ${config.apiToken}` },
          ],
        },
        403,
      ),
    );

    let error: unknown;
    try {
      await getCurrentProduction(config, { fetchImpl });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(config.apiToken);
    expect((error as Error).message).toContain("Bearer [REDACTED]");
  });
});
