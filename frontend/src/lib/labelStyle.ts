export const CARD_CHIP_LIMIT = 3;

const HEX_PATTERN = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/;

const FALLBACK_RGB = { r: 128, g: 128, b: 128 };
const DARK_TEXT = "#0b0d0e";
const LIGHT_TEXT = "#ffffff";
const DARK_TEXT_RGB = { r: 11, g: 13, b: 14 };

export const hexToRgb = (
  hex: string,
): { r: number; g: number; b: number } | null => {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) return null;

  return {
    r: parseInt(match[1]!, 16),
    g: parseInt(match[2]!, 16),
    b: parseInt(match[3]!, 16),
  };
};

export const hexToRgba = (hex: string, alpha: number): string => {
  const rgb = hexToRgb(hex) ?? FALLBACK_RGB;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const linearize = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.03928
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (rgb: { r: number; g: number; b: number }): number =>
  0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);

const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export const readableTextColor = (hex: string): "#0b0d0e" | "#ffffff" => {
  const fill = relativeLuminance(hexToRgb(hex) ?? FALLBACK_RGB);
  const againstDark = contrastRatio(fill, relativeLuminance(DARK_TEXT_RGB));
  const againstLight = contrastRatio(fill, 1);

  return againstDark >= againstLight ? DARK_TEXT : LIGHT_TEXT;
};

const LABEL_FILTER_PATTERN = /^label:(\d+)$/;

export const parseLabelFilter = (filter: string): number | undefined => {
  const match = LABEL_FILTER_PATTERN.exec(filter);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

export const labelFilterValue = (labelId: number): string => `label:${labelId}`;

export const hasLabel = (
  labels: { id: number }[] | undefined,
  labelId: number,
): boolean => Boolean(labels?.some((label) => label.id === labelId));

export const splitChips = <T>(
  items: T[],
  limit: number = CARD_CHIP_LIMIT,
): { visible: T[]; hiddenCount: number } => {
  if (items.length <= limit) {
    return { visible: items, hiddenCount: 0 };
  }
  return {
    visible: items.slice(0, limit),
    hiddenCount: items.length - limit,
  };
};
