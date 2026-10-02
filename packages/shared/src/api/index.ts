export type { paths, components, operations } from "./generated.ts";
export { apiContract } from "./schema.ts";
import type { components } from "./generated.ts";
export type TaskInput = components["schemas"]["TaskInput"];
export type TaskSubmission = components["schemas"]["TaskSubmission"];
export type Task = components["schemas"]["Task"];
export { createDatalomClient } from "./client.ts";
