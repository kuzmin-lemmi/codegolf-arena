type TaskFn<T> = () => Promise<T>;

export const MAX_CONCURRENT = 4;
export const MAX_QUEUE = 200;

export class SubmitQueueOverflowError extends Error {
  code = 'QUEUE_OVERFLOW';

  constructor() {
    super('Server overloaded, try later');
  }
}

class SubmitQueue {
  private running = 0;
  private queue: Array<{
    fn: TaskFn<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  enqueue<T>(fn: TaskFn<T>): Promise<T> {
    if (this.queue.length >= MAX_QUEUE) {
      throw new SubmitQueueOverflowError();
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as TaskFn<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.runNext();
    });
  }

  private runNext() {
    if (this.running >= MAX_CONCURRENT) return;
    const item = this.queue.shift();
    if (!item) return;

    this.running += 1;
    item.fn()
      .then((result) => item.resolve(result))
      .catch((err) => item.reject(err))
      .finally(() => {
        this.running -= 1;
        this.runNext();
      });
  }
}

const globalKey = '__submitQueue__';

const submitQueue: SubmitQueue =
  (globalThis as typeof globalThis & { [globalKey]?: SubmitQueue })[globalKey] ||
  new SubmitQueue();

(globalThis as typeof globalThis & { [globalKey]?: SubmitQueue })[globalKey] = submitQueue;

export function enqueueSubmit<T>(fn: TaskFn<T>): Promise<T> {
  return submitQueue.enqueue(fn);
}
