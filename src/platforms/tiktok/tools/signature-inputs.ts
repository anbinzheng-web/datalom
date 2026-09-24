import { openStore } from "../../../core/runtime.ts";
import {
  decodeGnarly,
  decodeDynosaur,
  md5,
  fnvHash,
} from "../signature-codec.ts";
const s = openStore();
try {
  const a = s.listAccounts().find((a) => a.label === "TikTok1")!,
    t = s.getSecret(a.id).research!.requestTemplates!["video.comments"],
    u = new URL(t.url),
    g = decodeGnarly(u.searchParams.get("X-Gnarly")!),
    d = decodeDynosaur(u.searchParams.get("X-Dynosaur")!);
  const names = ["X-Bogus", "X-Gnarly", "X-Dynosaur", "msToken"];
  for (let mask = 0; mask < 16; mask++) {
    const removed = names.filter((_, i) => mask & (1 << i));
    for (const format of ["raw", "normalized"]) {
      const qs = u.search
        .slice(1)
        .split("&")
        .filter((x) => !removed.includes(decodeURIComponent(x.split("=")[0])))
        .join("&");
      const value =
        format === "normalized" ? new URLSearchParams(qs).toString() : qs;
      if (md5(value) === g[3] || fnvHash(value) === d[46])
        console.log({
          removed,
          format,
          gnarly: md5(value) === g[3],
          dynosaur: fnvHash(value) === d[46],
        });
    }
  }
} finally {
  s.close();
}
