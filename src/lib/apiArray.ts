import { readApiList } from "./apiEnvelope";

export function readArrayPayload<T>(payload: unknown): T[] {
  return readApiList<T>(payload);
}
