export interface ThumbnailPort {
  generate(html: string): Promise<Uint8Array | null>;
}
