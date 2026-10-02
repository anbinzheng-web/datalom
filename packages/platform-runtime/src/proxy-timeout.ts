// Slow residential proxies often exceed 15s. The independent TikTok stack uses 25s.
export const PROXY_REQUEST_TIMEOUT_MS = 25_000;

export function classifyProxyFailure(error: unknown, aborted: boolean): string {
  if (aborted) return 'REQUEST_ABORTED';
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  if (/InvalidCertificate|certificate is not trusted/i.test(message)) return 'TARGET_TLS_FAILED';
  if (/aborted through AbortSignal|operation was aborted/i.test(message)) return 'REQUEST_ABORTED';
  if (
    /^(AbortError|TimeoutError|TimeoutException|ConnectTimeout|ReadTimeout|WriteTimeout|PoolTimeout)$/.test(
      name,
    )
  )
    return 'REQUEST_ABORTED';
  if (name === 'ProxyAuthRequired') return 'PROXY_AUTH_FAILED';
  if (name === 'ProxyTunnelError') return 'PROXY_TUNNEL_FAILED';
  if (/^(ProxyError|ConnectError|ConnectTimeout)$/.test(name)) return 'PROXY_CONNECT_FAILED';
  return 'PROXY_REQUEST_FAILED';
}
