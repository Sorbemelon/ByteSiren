export interface PublicViewMetrics {
  updated_at: string;
  today_utc: string;
  total_views: number;
  today_views: number;
}

interface TotalViewsRow {
  total_views: number | null;
}

interface TodayViewsRow {
  views: number;
  updated_at: string;
}

export function utcDate(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}

export async function getPublicViewMetrics(
  db: D1Database,
  now = new Date(),
): Promise<PublicViewMetrics> {
  const today = utcDate(now);
  const total = await db
    .prepare(
      "SELECT COALESCE(SUM(views), 0) AS total_views FROM public_view_counts",
    )
    .first<TotalViewsRow>();
  const todayRow = await db
    .prepare(
      "SELECT views, updated_at FROM public_view_counts WHERE view_date = ?",
    )
    .bind(today)
    .first<TodayViewsRow>();

  return {
    updated_at: todayRow?.updated_at ?? now.toISOString(),
    today_utc: today,
    total_views: Number(total?.total_views ?? 0),
    today_views: Number(todayRow?.views ?? 0),
  };
}

export async function incrementPublicViewCount(
  db: D1Database,
  now = new Date(),
): Promise<PublicViewMetrics> {
  const today = utcDate(now);
  const updatedAt = now.toISOString();

  await db
    .prepare(
      `INSERT INTO public_view_counts (view_date, views, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(view_date) DO UPDATE SET
         views = views + 1,
         updated_at = excluded.updated_at`,
    )
    .bind(today, updatedAt)
    .run();

  return getPublicViewMetrics(db, now);
}
