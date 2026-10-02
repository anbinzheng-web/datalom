import { publicError } from './public-api.service.js';
export interface EndpointDefinition {
  operation: string;
  fields: Record<string, string>;
  required: string[];
  numbers?: string[];
  defaults?: Record<string, unknown>;
  cursorKey?: string;
  /** Inputs used to select a matching observed context, never substituted blindly. */
  selectors?: string[];
  maxCount?: number;
}
export function parseParameters(
  def: EndpointDefinition,
  input: Record<string, unknown>,
  requestId: string,
) {
  const values: Record<string, unknown> = { ...def.defaults };
  for (const [key, value] of Object.entries(input)) {
    if (key === 'cursor' && def.cursorKey) {
      if (typeof value !== 'string' || !value || value.length > 24000)
        publicError(400, 'INVALID_INPUT', '无效 cursor', requestId);
      continue;
    }
    if (
      !Object.hasOwn(def.fields, key) ||
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > 1024
    )
      publicError(400, 'INVALID_INPUT', `参数无效：${key}`, requestId);
    if (def.numbers?.includes(key)) {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > (def.maxCount ?? 50))
        publicError(400, 'INVALID_INPUT', `参数数量无效：${key}`, requestId);
      values[def.fields[key]] = Number(value);
    } else {
      if (key.endsWith('_id') && !/^[A-Za-z0-9+/=_:-]{1,256}$/.test(value))
        publicError(400, 'INVALID_INPUT', `ID 无效：${key}`, requestId);
      values[def.fields[key]] = value;
    }
  }
  for (const key of def.required)
    if (!input[key]) publicError(400, 'INVALID_INPUT', `缺少参数：${key}`, requestId);
  return values;
}
