import { describe, expect, it, vi } from "vitest";
import { UploadRequestScheduler } from "../../src/lib/uploadRequestScheduler";

describe("UploadRequestScheduler", () => {
  it("grants permits FIFO without exceeding the configured limit", async () => {
    const scheduler = new UploadRequestScheduler(2);
    const first = await scheduler.acquire();
    const second = await scheduler.acquire();
    const granted: string[] = [];
    const thirdPromise = scheduler.acquire().then((release) => {
      granted.push("third");
      return release;
    });
    const fourthPromise = scheduler.acquire().then((release) => {
      granted.push("fourth");
      return release;
    });

    expect(scheduler.activeCount).toBe(2);
    expect(scheduler.pendingCount).toBe(2);

    first();
    const third = await thirdPromise;
    expect(granted).toEqual(["third"]);
    expect(scheduler.activeCount).toBe(2);
    expect(scheduler.pendingCount).toBe(1);

    second();
    const fourth = await fourthPromise;
    expect(granted).toEqual(["third", "fourth"]);

    third();
    third();
    fourth();
    expect(scheduler.activeCount).toBe(0);
    expect(scheduler.pendingCount).toBe(0);
  });

  it("removes an aborted waiter without consuming or leaking a permit", async () => {
    const scheduler = new UploadRequestScheduler(1);
    const release = await scheduler.acquire();
    const controller = new AbortController();
    const waiting = scheduler.acquire(controller.signal);

    expect(scheduler.pendingCount).toBe(1);
    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(scheduler.activeCount).toBe(1);
    expect(scheduler.pendingCount).toBe(0);

    release();
    const nextRelease = await scheduler.acquire();
    expect(scheduler.activeCount).toBe(1);
    nextRelease();
    expect(scheduler.activeCount).toBe(0);
  });

  it("cancels a queued request when any linked signal aborts", async () => {
    const scheduler = new UploadRequestScheduler(1);
    const release = await scheduler.acquire();
    const uploadController = new AbortController();
    const connectionController = new AbortController();
    const waiting = scheduler.acquire([
      uploadController.signal,
      connectionController.signal,
    ]);

    connectionController.abort();

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(scheduler.pendingCount).toBe(0);
    release();
    expect(scheduler.activeCount).toBe(0);
  });

  it("always releases a run permit when the operation fails", async () => {
    const scheduler = new UploadRequestScheduler(1);
    const failure = new Error("S3 failed");
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(scheduler.run(operation)).rejects.toBe(failure);

    expect(operation).toHaveBeenCalledOnce();
    expect(scheduler.activeCount).toBe(0);
    expect(scheduler.pendingCount).toBe(0);
  });
});
