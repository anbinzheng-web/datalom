import createClient, { type ClientOptions } from "openapi-fetch";
import type { paths } from "./generated.ts";

/** Supply authentication via headers or middleware; no credentials are persisted. */
export const createDatalomClient = (options: ClientOptions) =>
  createClient<paths>(options);
