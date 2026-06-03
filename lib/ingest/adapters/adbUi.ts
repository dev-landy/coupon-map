export interface Point {
  x: number;
  y: number;
}

export interface UiNodeAttrs {
  text: string;
  contentDesc: string;
  className: string;
  packageName: string;
  resourceId: string;
  bounds: string;
  clickable: boolean;
  enabled: boolean;
  selected: boolean;
  checked: boolean;
}

export interface TransientUiOptions {
  dismissTexts?: readonly string[];
  transientHintPatterns?: readonly RegExp[];
}

export interface TransientUiDismissTarget {
  point: Point;
  label: string;
  priority: number;
}

const DEFAULT_TRANSIENT_HINT_PATTERNS = [
  /오늘\s*(하루|은)?\s*(그만\s*)?보지\s*않기/,
  /다시\s*보지\s*않기/,
  /1\s*일\s*동안\s*보지\s*않기/,
  /팝업/,
  /업데이트\s*안내/,
  /앱\s*접근\s*권한/,
  /권한\s*(안내|허용|요청)/,
  /마케팅\s*(수신|정보)/,
  /광고성\s*정보/,
  /permission/i,
];

const PERMISSION_LABELS = new Set([
  normalizeLabel('앱 사용 중에만 허용'),
  normalizeLabel('이번만 허용'),
  normalizeLabel('허용'),
  normalizeLabel('Allow'),
  normalizeLabel('While using the app'),
]);

const DO_NOT_SHOW_LABELS = new Set([
  normalizeLabel('오늘 하루 보지 않기'),
  normalizeLabel('오늘은 그만 보기'),
  normalizeLabel('다시 보지 않기'),
  normalizeLabel('1일 동안 보지 않기'),
]);

const CLOSE_LABELS = new Set([
  normalizeLabel('닫기'),
  normalizeLabel('닫기 버튼'),
  normalizeLabel('Close'),
  normalizeLabel('X'),
  normalizeLabel('×'),
  normalizeLabel('✕'),
  normalizeLabel('✖'),
]);

const CONFIRM_LABELS = new Set([
  normalizeLabel('OK'),
  normalizeLabel('확인'),
  normalizeLabel('네'),
  normalizeLabel('예'),
  normalizeLabel('동의'),
  normalizeLabel('동의하기'),
  normalizeLabel('계속'),
]);

const DEFER_LABELS = new Set([
  normalizeLabel('나중에'),
  normalizeLabel('다음에'),
  normalizeLabel('건너뛰기'),
  normalizeLabel('Skip'),
  normalizeLabel('No thanks'),
  normalizeLabel('취소'),
]);

export function findTransientUiDismissTarget(
  xml: string,
  options: TransientUiOptions = {}
): TransientUiDismissTarget | null {
  const customLabels = new Set((options.dismissTexts ?? []).map(normalizeLabel));
  const targets = extractUiNodeAttrs(xml)
    .map((node) => {
      const bounds = parseBounds(node.bounds);
      if (!bounds || !node.enabled) return null;

      const match = findDismissMatch(node, customLabels);
      if (!match) return null;
      if (!isLikelyTappableDismiss(node, match.priority)) return null;

      return {
        point: {
          x: Math.round((bounds.x1 + bounds.x2) / 2),
          y: Math.round((bounds.y1 + bounds.y2) / 2),
        },
        label: match.label,
        priority: match.priority,
        bounds,
      };
    })
    .filter(
      (
        target
      ): target is TransientUiDismissTarget & {
        bounds: NonNullable<ReturnType<typeof parseBounds>>;
      } => target !== null
    )
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (isTopRight(a.bounds) !== isTopRight(b.bounds)) {
        return isTopRight(a.bounds) ? -1 : 1;
      }
      return b.bounds.y2 - a.bounds.y2;
    });

  return targets[0] ?? null;
}

export function looksLikeTransientUi(
  xml: string,
  options: TransientUiOptions = {}
): boolean {
  const patterns = [
    ...DEFAULT_TRANSIENT_HINT_PATTERNS,
    ...(options.transientHintPatterns ?? []),
  ];

  return extractUiNodeAttrs(xml).some((node) => {
    const className = normalizeText(node.className);
    const packageName = normalizeText(node.packageName);
    if (/dialog/i.test(className)) return true;
    if (/permission/i.test(packageName) || /permission/i.test(className)) return true;

    return [node.text, node.contentDesc]
      .map(normalizeText)
      .filter(Boolean)
      .some((value) => patterns.some((pattern) => pattern.test(value)));
  });
}

export function extractUiNodeAttrs(xml: string): UiNodeAttrs[] {
  const nodes: UiNodeAttrs[] = [];
  for (const match of xml.matchAll(/<node\b([^>]*)/g)) {
    const attrs = parseAttributes(match[1] ?? '');
    nodes.push({
      text: decodeXml(attrs.text ?? ''),
      contentDesc: decodeXml(attrs['content-desc'] ?? ''),
      className: decodeXml(attrs.class ?? ''),
      packageName: decodeXml(attrs.package ?? ''),
      resourceId: decodeXml(attrs['resource-id'] ?? ''),
      bounds: decodeXml(attrs.bounds ?? ''),
      clickable: attrs.clickable === 'true',
      enabled: attrs.enabled !== 'false',
      selected: attrs.selected === 'true',
      checked: attrs.checked === 'true',
    });
  }
  return nodes;
}

function findDismissMatch(
  node: UiNodeAttrs,
  customLabels: ReadonlySet<string>
): { label: string; priority: number } | null {
  const labels = [node.text, node.contentDesc].map(normalizeText).filter(Boolean);

  for (const label of labels) {
    const normalized = normalizeLabel(label);
    if (customLabels.has(normalized)) return { label, priority: 1 };
    if (PERMISSION_LABELS.has(normalized)) return { label, priority: 0 };
    if (DO_NOT_SHOW_LABELS.has(normalized)) return { label, priority: 1 };
    if (CLOSE_LABELS.has(normalized)) return { label, priority: 2 };
    if (CONFIRM_LABELS.has(normalized)) return { label, priority: 3 };
    if (DEFER_LABELS.has(normalized)) return { label, priority: 4 };
  }

  return null;
}

function isLikelyTappableDismiss(node: UiNodeAttrs, priority: number): boolean {
  if (node.clickable || /button/i.test(node.className)) return true;

  const normalizedText = normalizeLabel(node.text);
  const normalizedDesc = normalizeLabel(node.contentDesc);
  if (CLOSE_LABELS.has(normalizedText) || CLOSE_LABELS.has(normalizedDesc)) return true;
  if (DO_NOT_SHOW_LABELS.has(normalizedText) || DO_NOT_SHOW_LABELS.has(normalizedDesc)) {
    return true;
  }

  return priority <= 1 && /textview|view/i.test(node.className);
}

function parseAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([\w:-]+)="([^"]*)"/g;
  for (const match of input.matchAll(attrPattern)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseBounds(
  bounds: string
): { x1: number; y1: number; x2: number; y2: number } | null {
  const match = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) return null;
  return {
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
}

function isTopRight(bounds: NonNullable<ReturnType<typeof parseBounds>>): boolean {
  return bounds.x1 > 700 && bounds.y2 < 450;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeLabel(text: string): string {
  return normalizeText(text).replace(/\s+/g, '').toLowerCase();
}
