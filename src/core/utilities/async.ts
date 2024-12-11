import { CancellationError } from "vscode";

export type ValueCallback<T = unknown> = (value: T | Promise<T>) => void;

const enum DeferredOutcome {
  Resolved,
  Rejected,
}

/**
 * Creates a promise whose resolution or rejection can be controlled imperatively.
 */
export class DeferredPromise<T> {
  private completeCallback!: ValueCallback<T>;
  private errorCallback!: (err: unknown) => void;
  private outcome?:
    | { outcome: DeferredOutcome.Rejected; value: any }
    | { outcome: DeferredOutcome.Resolved; value: T };

  public get isRejected() {
    return this.outcome?.outcome === DeferredOutcome.Rejected;
  }

  public get isResolved() {
    return this.outcome?.outcome === DeferredOutcome.Resolved;
  }

  public get isSettled() {
    return !!this.outcome;
  }

  public get value() {
    return this.outcome?.outcome === DeferredOutcome.Resolved
      ? this.outcome?.value
      : undefined;
  }

  public readonly p: Promise<T>;

  constructor() {
    this.p = new Promise<T>((c, e) => {
      this.completeCallback = c;
      this.errorCallback = e;
    });
  }

  public complete(value: T) {
    return new Promise<void>((resolve) => {
      this.completeCallback(value);
      this.outcome = { outcome: DeferredOutcome.Resolved, value };
      resolve();
    });
  }

  public error(err: unknown) {
    return new Promise<void>((resolve) => {
      this.errorCallback(err);
      this.outcome = { outcome: DeferredOutcome.Rejected, value: err };
      resolve();
    });
  }

  public cancel() {
    return this.error(new CancellationError());
  }
}
