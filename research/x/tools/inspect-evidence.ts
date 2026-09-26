import { openStore } from "@datalom/storage-node/runtime";
const s = openStore();
for (const id of process.argv.slice(2)) {
  const c = s.diagnostics.rawEvent(id) as any;
  const u = new URL(c.url);
  const j = JSON.parse(c.body);
  const paths: any[] = [];
  function walk(v: any, path: string) {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      paths.push({
        path,
        length: v.length,
        firstKeys: Object.keys(v[0] ?? {}),
      });
      if (v[0]) walk(v[0], path + "[0]");
      return;
    }
    for (const [k, x] of Object.entries(v)) walk(x, path + "." + k);
  }
  walk(j, "$");
  console.log(
    JSON.stringify(
      {
        id,
        name: c.name,
        method: c.method,
        variables: u.searchParams.get("variables"),
        paths,
      },
      null,
      2,
    ),
  );
}
s.close();
