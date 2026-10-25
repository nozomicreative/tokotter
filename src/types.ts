// Shared evidence + artifact types. Everything here is produced on-device;
// nothing here ever leaves the machine.
export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface ScanEvidence {
  url: string;
  title: string;
  scannedAt: string;
  viewport: Viewport;
  colors: { color: string; count: number }[];
  fonts: {
    family: string;
    weights: string[];
    sizes: number[];
    lineHeights: string[];
    letterSpacings: string[];
    categories: string[];
  }[];
  spacings: number[];
  spacingBase: number | null;
  borderRadii: number[];
  shadows: { value: string; count: number }[];
  gradients: { value: string; count: number }[];
  themedVariables: Record<string, Record<string, string>>;
  limitations: string[];
}

export interface TokenRecord {
  name: string;
  value: string;
  role: string;
  sourceType: 'observed' | 'inferred';
  source: string;
  confidence: number;
  evidence: string[];
}

export interface PackMeta {
  url: string;
  host: string;
  generatedAt: string;
  viewport: { width: number; height: number; scale: number } | null;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}
