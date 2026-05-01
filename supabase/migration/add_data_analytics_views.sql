CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON public.tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_recorded_at ON public.kpi_snapshots(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_corps_metric ON public.kpi_snapshots(corps, metric_name, recorded_at DESC);

CREATE OR REPLACE VIEW public.analytics_task_overview AS
SELECT
  t.corps,
  COUNT(*)::INTEGER AS task_total,
  COUNT(*) FILTER (WHERE t.status <> 'done')::INTEGER AS open_tasks,
  COUNT(*) FILTER (WHERE t.status = 'done')::INTEGER AS done_tasks,
  COUNT(*) FILTER (WHERE t.status = 'blocked')::INTEGER AS blocked_tasks,
  COUNT(*) FILTER (WHERE t.priority IN ('P0', 'P1') AND t.status <> 'done')::INTEGER AS critical_open_tasks,
  COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE AND t.status <> 'done')::INTEGER AS overdue_tasks,
  ROUND(COALESCE(AVG(t.time_estimate_hours), 0), 1) AS avg_estimate_hours,
  ROUND(COALESCE(AVG(t.time_spent_hours), 0), 1) AS avg_spent_hours,
  ROUND(
    CASE WHEN COUNT(*) = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE t.status = 'done')::NUMERIC / COUNT(*)::NUMERIC) * 100
    END,
    1
  ) AS completion_rate,
  MAX(t.updated_at) AS last_task_update_at
FROM public.tasks AS t
GROUP BY t.corps;

CREATE OR REPLACE VIEW public.analytics_kpi_latest AS
WITH ranked AS (
  SELECT
    k.corps,
    k.metric_name,
    k.metric_value,
    k.target_value,
    k.recorded_at,
    ROW_NUMBER() OVER (
      PARTITION BY k.corps, k.metric_name
      ORDER BY k.recorded_at DESC, k.id DESC
    ) AS row_num
  FROM public.kpi_snapshots AS k
)
SELECT
  corps,
  metric_name,
  metric_value,
  target_value,
  recorded_at,
  ROUND(
    CASE
      WHEN target_value IS NULL OR target_value = 0 THEN NULL
      ELSE (metric_value / target_value) * 100
    END,
    1
  ) AS attainment_pct
FROM ranked
WHERE row_num = 1;

CREATE OR REPLACE VIEW public.analytics_daily_activity AS
WITH corps_scope AS (
  SELECT NULL::corps_type AS corps
  UNION ALL
  SELECT UNNEST(enum_range(NULL::corps_type))::corps_type AS corps
),
calendar AS (
  SELECT generate_series(
    CURRENT_DATE - INTERVAL '89 days',
    CURRENT_DATE,
    INTERVAL '1 day'
  )::DATE AS day
),
created_tasks AS (
  SELECT DATE_TRUNC('day', created_at)::DATE AS day, corps, COUNT(*)::INTEGER AS created_count
  FROM public.tasks
  GROUP BY 1, 2
),
completed_tasks AS (
  SELECT DATE_TRUNC('day', updated_at)::DATE AS day, corps, COUNT(*)::INTEGER AS completed_count
  FROM public.tasks
  WHERE status = 'done'
  GROUP BY 1, 2
),
recorded_kpis AS (
  SELECT DATE_TRUNC('day', recorded_at)::DATE AS day, corps, COUNT(*)::INTEGER AS snapshot_count
  FROM public.kpi_snapshots
  GROUP BY 1, 2
),
created_tasks_total AS (
  SELECT DATE_TRUNC('day', created_at)::DATE AS day, COUNT(*)::INTEGER AS created_count
  FROM public.tasks
  GROUP BY 1
),
completed_tasks_total AS (
  SELECT DATE_TRUNC('day', updated_at)::DATE AS day, COUNT(*)::INTEGER AS completed_count
  FROM public.tasks
  WHERE status = 'done'
  GROUP BY 1
),
recorded_kpis_total AS (
  SELECT DATE_TRUNC('day', recorded_at)::DATE AS day, COUNT(*)::INTEGER AS snapshot_count
  FROM public.kpi_snapshots
  GROUP BY 1
)
SELECT
  c.day,
  cs.corps,
  COALESCE(
    CASE WHEN cs.corps IS NULL THEN ctt.created_count ELSE ct.created_count END,
    0
  ) AS created_count,
  COALESCE(
    CASE WHEN cs.corps IS NULL THEN cdt.completed_count ELSE dt.completed_count END,
    0
  ) AS completed_count,
  COALESCE(
    CASE WHEN cs.corps IS NULL THEN ktt.snapshot_count ELSE kt.snapshot_count END,
    0
  ) AS snapshot_count
FROM calendar AS c
CROSS JOIN corps_scope AS cs
LEFT JOIN created_tasks AS ct ON ct.day = c.day AND ct.corps = cs.corps
LEFT JOIN completed_tasks AS dt ON dt.day = c.day AND dt.corps = cs.corps
LEFT JOIN recorded_kpis AS kt ON kt.day = c.day AND kt.corps = cs.corps
LEFT JOIN created_tasks_total AS ctt ON ctt.day = c.day
LEFT JOIN completed_tasks_total AS cdt ON cdt.day = c.day
LEFT JOIN recorded_kpis_total AS ktt ON ktt.day = c.day
ORDER BY c.day DESC, cs.corps NULLS FIRST;