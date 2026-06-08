export interface StoragePort {
  put(key: string, data: Uint8Array, meta?: { contentType?: string }): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}
