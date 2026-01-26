-- 为 access_codes 表增加 reserved_at 字段，用于记录激活码进入 reserved 状态的时间
-- 该时间用于统计真实的“发放日期”，便于监控发放趋势与防刷单。

ALTER TABLE access_codes
  ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;

