-- 扩展 access_codes.status，增加 reserved 中间状态
-- 说明：
-- - unused   : 已生成、未发放
-- - reserved : 已发放（导出 / 后台领取 / 公共接口分配），但尚未被注册占用
-- - active   : 已被用户注册占用
-- - expired  : 已失效

ALTER TABLE access_codes
  DROP CONSTRAINT IF EXISTS access_codes_status_check;

ALTER TABLE access_codes
  ADD CONSTRAINT access_codes_status_check
  CHECK (status IN ('unused', 'reserved', 'active', 'expired'));

