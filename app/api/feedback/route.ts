import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const FEEDBACK_TYPES = [
  'coupon_incorrect',
  'store_location',
  'app_problem',
  'feature_request',
  'other',
] as const;

type FeedbackType = (typeof FEEDBACK_TYPES)[number];

interface FeedbackPayload {
  type: FeedbackType;
  message: string;
  contact: string | null;
  storeId: string | null;
  couponId: string | null;
  brandId: string | null;
  brandName: string | null;
  pagePath: string | null;
  searchRadiusMeters: number | null;
}

const MAX_MESSAGE_LENGTH = 1000;
const MAX_CONTACT_LENGTH = 160;
const MAX_ID_LENGTH = 120;
const MAX_BRAND_NAME_LENGTH = 120;
const MAX_PAGE_PATH_LENGTH = 300;
const MAX_USER_AGENT_LENGTH = 500;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'JSON body is required.' }, { status: 400 });
  }

  if (isSpamTrapFilled(body)) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const parsed = parseFeedbackPayload(body);
  if ('error' in parsed) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  const client = createFeedbackClient();
  if (!client) {
    return NextResponse.json(
      { message: 'Feedback storage is not configured.' },
      { status: 503 }
    );
  }

  const userAgent = truncateNullable(request.headers.get('user-agent'), MAX_USER_AGENT_LENGTH);
  const { error } = await client.from('feedback_reports').insert({
    type: parsed.payload.type,
    message: parsed.payload.message,
    contact: parsed.payload.contact,
    store_id: parsed.payload.storeId,
    coupon_id: parsed.payload.couponId,
    brand_id: parsed.payload.brandId,
    brand_name: parsed.payload.brandName,
    page_path: parsed.payload.pagePath,
    search_radius_meters: parsed.payload.searchRadiusMeters,
    user_agent: userAgent,
    source: 'coupon-map-web',
  });

  if (error) {
    console.error('Failed to save feedback:', error.message);
    return NextResponse.json({ message: 'Failed to save feedback.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

function createFeedbackClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function parseFeedbackPayload(
  body: unknown
): { payload: FeedbackPayload } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object.' };

  const type = parseFeedbackType(body.type);
  if (!type) return { error: 'Invalid feedback type.' };

  const message = parseRequiredString(body.message, MAX_MESSAGE_LENGTH);
  if (!message) return { error: 'Feedback message must be between 3 and 1000 characters.' };

  const searchRadiusMeters = parseNullableRadius(body.searchRadiusMeters);
  if (searchRadiusMeters === undefined) {
    return { error: 'searchRadiusMeters must be a non-negative number.' };
  }

  return {
    payload: {
      type,
      message,
      contact: parseNullableString(body.contact, MAX_CONTACT_LENGTH),
      storeId: parseNullableString(body.storeId, MAX_ID_LENGTH),
      couponId: parseNullableString(body.couponId, MAX_ID_LENGTH),
      brandId: parseNullableString(body.brandId, MAX_ID_LENGTH),
      brandName: parseNullableString(body.brandName, MAX_BRAND_NAME_LENGTH),
      pagePath: parseNullableString(body.pagePath, MAX_PAGE_PATH_LENGTH),
      searchRadiusMeters,
    },
  };
}

function parseFeedbackType(value: unknown): FeedbackType | null {
  return typeof value === 'string' && FEEDBACK_TYPES.includes(value as FeedbackType)
    ? (value as FeedbackType)
    : null;
}

function parseRequiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > maxLength) return null;
  return trimmed;
}

function parseNullableString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  return truncateNullable(value.trim() || null, maxLength);
}

function truncateNullable(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function parseNullableRadius(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

function isSpamTrapFilled(body: unknown): boolean {
  return isRecord(body) && typeof body.website === 'string' && body.website.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
