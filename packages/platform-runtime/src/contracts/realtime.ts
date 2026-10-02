import { z } from 'zod';

export const cloudEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('heartbeat') }),
  z.object({ type: z.literal('tasks.changed'), revision: z.number().int().nonnegative() }),
  z.object({ type: z.literal('reports.changed'), runId: z.string() }),
  z.object({ type: z.literal('devices.changed'), deviceId: z.string() }),
  z.object({ type: z.literal('session.revoked') }),
  z.object({ type: z.literal('execution.changed'), deviceId: z.string() }),
  z.object({ type: z.literal('execution.requested'), deviceId: z.string() }),
]);
export type CloudEvent = z.infer<typeof cloudEventSchema>;

// Browser and host share recovery/backoff semantics. The host alone supplies credentials.
export class CloudConnection {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private attempt = 0;
  constructor(
    private connect: () => Promise<WebSocket> | WebSocket,
    private event: (event: CloudEvent) => void,
    private status: (connected: boolean) => void = () => {},
  ) {}
  start() {
    void this.open();
  }
  private async open() {
    if (this.stopped) return;
    try {
      const socket = await this.connect();
      // Node ws emits an error when a still-connecting socket is closed.
      socket.addEventListener('error', () => {});
      if (this.stopped) {
        socket.close();
        return;
      }
      this.socket = socket;
      const watch = () => {
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => {
          if (this.socket !== socket) return;
          this.socket = undefined;
          socket.close();
          this.retry();
        }, 75_000);
      };
      watch();
      socket.addEventListener('message', ({ data }) => {
        if (this.socket !== socket) return;
        let parsed;
        try {
          parsed = cloudEventSchema.safeParse(JSON.parse(String(data)));
        } catch {
          socket.close(1008, 'Invalid event');
          return;
        }
        if (!parsed.success) {
          socket.close(1008, 'Invalid event');
          return;
        }
        watch();
        if (parsed.data.type === 'ready') {
          this.attempt = 0;
          this.status(true);
        }
        if (parsed.data.type === 'session.revoked') this.stop();
        this.event(parsed.data);
      });
      socket.addEventListener('close', ({ code }) => {
        if (this.socket !== socket) return;
        this.socket = undefined;
        if (code === 4401) {
          this.stop();
          this.event({ type: 'session.revoked' });
        } else this.retry();
      });
      socket.addEventListener('error', () => socket.close());
    } catch {
      this.retry();
    }
  }
  private retry() {
    clearTimeout(this.watchdog);
    this.status(false);
    if (this.stopped) return;
    clearTimeout(this.timer);
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempt++, 5));
    this.timer = setTimeout(() => void this.open(), delay * (0.8 + Math.random() * 0.4));
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.watchdog);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.status(false);
  }
}
