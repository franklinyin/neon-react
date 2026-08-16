export type VerovioEditorAction = {
  action: string;
  param?: unknown;
};

type PendingRequest = {
  resolve: (value: WorkerResult) => void;
  reject: (reason: Error) => void;
};

type WorkerResult = {
  id: string;
  svg?: string;
  mei?: string;
  result?: boolean;
  attributes?: Record<string, string>;
  info?: unknown;
};

/**
 * Thin Vite-friendly client around the public Verovio worker.
 * Musical source of truth stays in the toolkit; this only shuttles messages.
 */
export class VerovioClient {
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly ready: Promise<void>;
  private disposed = false;

  constructor() {
    const workerUrl = `${import.meta.env.BASE_URL}verovio/VerovioWorker.js`;
    this.worker = new Worker(workerUrl);

    this.ready = new Promise((resolve, reject) => {
      const onReady = (event: MessageEvent<unknown>): void => {
        if (event.data !== 'ready') {
          return;
        }
        this.worker.removeEventListener('message', onReady);
        resolve();
      };

      this.worker.addEventListener('message', onReady);
      this.worker.addEventListener('error', (event) => {
        reject(new Error(event.message || 'Verovio worker failed to load'));
      });
    });

    this.worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === 'ready' || typeof event.data !== 'object' || event.data === null) {
        return;
      }
      const data = event.data as WorkerResult;
      if (typeof data.id !== 'string') {
        return;
      }
      const pending = this.pending.get(data.id);
      if (!pending) {
        return;
      }
      this.pending.delete(data.id);
      pending.resolve(data);
    });
  }

  async waitUntilReady(): Promise<void> {
    await this.ready;
  }

  async renderData(mei: string): Promise<string> {
    const response = await this.request('renderData', { mei });
    if (!response.svg) {
      throw new Error('renderData returned empty SVG');
    }
    return response.svg;
  }

  async getMEI(): Promise<string> {
    const response = await this.request('getMEI');
    if (!response.mei) {
      throw new Error('getMEI returned empty MEI');
    }
    return response.mei;
  }

  async renderToSVG(): Promise<string> {
    const response = await this.request('renderToSVG');
    if (!response.svg) {
      throw new Error('renderToSVG returned empty SVG');
    }
    return response.svg;
  }

  async edit(editorAction: VerovioEditorAction): Promise<boolean> {
    const response = await this.request('edit', { editorAction });
    return Boolean(response.result);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const pending of this.pending.values()) {
      pending.reject(new Error('VerovioClient disposed'));
    }
    this.pending.clear();
    this.worker.terminate();
  }

  private async request(
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<WorkerResult> {
    if (this.disposed) {
      throw new Error('VerovioClient is disposed');
    }
    await this.ready;
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, action, ...extra });
    });
  }
}
