export const checkAbort = (signal: AbortSignal) => {
  if (signal.aborted) throw signal.reason ?? new Error('CANCELLED');
};

export function withTimeout<T>(work: Promise<T>, ms: number, code = 'TIMEOUT'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function pause(ms: number, signal: AbortSignal) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    checkAbort(signal);
    await new Promise((r) => setTimeout(r, Math.min(100, until - Date.now())));
  }
  checkAbort(signal);
}
