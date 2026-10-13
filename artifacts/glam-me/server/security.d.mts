export const NOINDEX: string;
export const FRAME_POLICY: string;
export const DEVELOPMENT_FRAME_POLICY: string;
export function storefrontHeaders(options?: { development?: boolean; html?: string }): Record<string, string>;
