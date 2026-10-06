import type { Command, NetMessage, TurnMessage } from '@net/protocol';

/**
 * How lockstep messages reach the other player (Phase 22). The WebSocket
 * relay (step 3) and the loopback below both implement it.
 */
export interface Transport {
  send(message: NetMessage): void;
  /** Returns an unsubscribe function. */
  onMessage(handler: (message: NetMessage) => void): () => void;
  close(): void;
}

export interface LoopbackOptions {
  /** One-way delay in real ms; 0 answers at once (synchronously), for fast checks. */
  latencyMs?: number;
  /** The pretend opponent's commands for a turn (none by default). */
  commandsFor?: (turn: number) => Command[];
  /** Answer with a wrong state hash, to test desync detection. */
  corruptHash?: boolean;
}

/**
 * A pretend opponent in the same page (dev and checks): it answers each of
 * our turn messages with its own message for the same turn, after
 * `latencyMs`, and echoes our hash back (so the games "match") unless told
 * to corrupt it.
 */
export class LoopbackTransport implements Transport {
  private readonly handlers = new Set<(message: NetMessage) => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly options: LoopbackOptions;
  private closed = false;

  constructor(options: LoopbackOptions = {}) {
    this.options = options;
  }

  send(message: NetMessage): void {
    if (this.closed || message.kind !== 'turn') return;
    const reply: TurnMessage = { kind: 'turn', turn: message.turn, commands: this.options.commandsFor?.(message.turn) ?? [] };
    if (message.hash) reply.hash = { turn: message.hash.turn, value: this.options.corruptHash ? `x${message.hash.value}` : message.hash.value };
    const latency = this.options.latencyMs ?? 0;
    if (latency <= 0) {
      this.deliver(reply);
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.deliver(reply);
    }, latency);
    this.timers.add(timer);
  }

  onMessage(handler: (message: NetMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.handlers.clear();
  }

  private deliver(message: NetMessage): void {
    if (this.closed) return;
    for (const handler of this.handlers) handler(message);
  }
}
