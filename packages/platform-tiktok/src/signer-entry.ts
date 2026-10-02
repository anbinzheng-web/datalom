import { signRequest, type SignInput } from "./signer.ts";
import { DatalomError } from "@datalom/shared/runtime/contracts";
process.once("message", (input: SignInput) => {
  try {
    process.send?.({ url: signRequest(input) });
  } catch (e) {
    process.send?.({
      detail:
        e instanceof Error
          ? { name: e.name, message: e.message, stack: e.stack }
          : { thrown: String(e) },
      error:
        e instanceof DatalomError ? e.message : "签名解析失败，需要检查样本版本",
    });
  }
});
