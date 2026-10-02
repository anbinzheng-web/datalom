import { artifactPath } from "@datalom/shared/runtime/paths";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import {
  nativeEndpoints,
  type NativeOperation,
} from "@datalom/platform-tiktok/native";
import { openStore } from "@datalom/shared/storage/runtime";
const store = openStore();
try {
  mkdirSync(artifactPath("tiktok-native"), { recursive: true });
  const runs = readdirSync(artifactPath("tiktok-native"))
    .filter((f) => /^independent-.*\.json$/.test(f))
    .map((f) =>
      JSON.parse(readFileSync(artifactPath(`tiktok-native/${f}`), "utf8")),
    );
  const operations = Object.entries(nativeEndpoints).map(([operation, def]) => {
    const matching = runs.filter((r) => r.operation === operation);
    const successes = matching.filter((r) => r.status === "succeeded");
    return {
      operation,
      method: "GET",
      origin: "origin" in def ? def.origin : "https://www.tiktok.com",
      path: def.path,
      fields: def.fields,
      required: def.required,
      status: successes.length
        ? "independent-live-sample-verified"
        : "implemented-unverified",
      accounts: [...new Set(successes.map((r) => r.account))],
      runs: matching.map((r) => {
        const capture: any = store.diagnostics.rawEvent(r.captureId);
        const capturedUrl = new URL(capture.url);
        const requests = store.sql
          .prepare(
            "SELECT id FROM diagnostic_events WHERE requestId=? AND stage='native-request' AND outcome='started' ORDER BY seq",
          )
          .all(r.requestId) as { id: string }[];
        const signatureProof = requests.map((row) => {
          const raw: any = store.diagnostics.rawEvent(row.id);
          const u = new URL(raw.signedUrl);
          return {
            evidenceId: row.id,
            counter: raw.counter,
            gnarlyChanged:
              u.searchParams.get("X-Gnarly") !==
              capturedUrl.searchParams.get("X-Gnarly"),
            dynosaurChanged:
              u.searchParams.get("X-Dynosaur") !==
              capturedUrl.searchParams.get("X-Dynosaur"),
          };
        });
        return {
          requestId: r.requestId,
          account: r.account,
          captureId: r.captureId,
          status: r.status,
          error: r.error,
          startedAt: r.startedAt,
          pages: r.results,
          signatureProof,
        };
      }),
    };
  });
  const report = {
    generatedAt: new Date().toISOString(),
    browserClosedEvidenceIds: [
      "572ee1a2-74dd-4056-b5d8-c5302be4196e",
      "8e4b515e-2dbc-4e8e-ab9a-42447c39ea1f",
    ],
    newlyVerified: operations.filter(
      (o) => o.status === "independent-live-sample-verified",
    ).length,
    operations,
  };
  writeFileSync(
    artifactPath("tiktok-native/inventory.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        newlyVerified: report.newlyVerified,
        operations: operations.map((o) => ({
          operation: o.operation,
          status: o.status,
          counts: o.runs
            .filter((r) => r.status === "succeeded")
            .map((r) => r.pages.map((p: any) => p.count)),
          freshSignatures: o.runs
            .filter((r) => r.status === "succeeded")
            .every(
              (r) =>
                r.signatureProof.length > 0 &&
                r.signatureProof.every(
                  (p) => p.gnarlyChanged && p.dynosaurChanged,
                ),
            ),
        })),
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
