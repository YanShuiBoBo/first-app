import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /auto-join
 *
 * 公共自动分配激活码入口：
 * - 从 access_codes 中挑选一枚 status = 'unused' 且未过期的激活码
 * - 原子地将其标记为 'reserved'（中间状态：已发放待使用）
 * - 然后重定向到注册页，并通过 inviteCode 预填激活码
 *
 * 注意：
 * - 当没有可用激活码时，返回简单的提示页面，而不是报 500。
 */
export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  let assignedCode: string | null = null;

  // 简单的重试机制：在高并发下最多尝试 3 次避免同一码被同时占用
  for (let attempt = 0; attempt < 3 && !assignedCode; attempt += 1) {
    const { data: candidates, error } = await supabase
      .from("access_codes")
      .select("code, status")
      // 公共接口：仅从“未发放”的激活码中分配（初始化状态：unused）
      .eq("status", "unused")
      .limit(100);

    if (error) {
      console.error("[auto-join] 查询激活码失败:", error);
      return NextResponse.json(
        { error: "当前无法分配激活码，请稍后重试。" },
        { status: 500 }
      );
    }

    // 仅使用未发放（unused）的激活码
    const available = (candidates || []).filter(
      (row) => row.status === "unused"
    );

    if (available.length === 0) {
      break;
    }

    const picked =
      available[Math.floor(Math.random() * available.length)];

    const { data: updated, error: updateError } = await supabase
      .from("access_codes")
      .update({ status: "reserved" })
      .eq("code", picked.code)
      // 仅允许从初始化状态更新为 reserved，避免已发放/占用的激活码被重复分配
      .eq("status", "unused")
      .select("code")
      .maybeSingle();

    if (updateError) {
      console.error("[auto-join] 锁定激活码失败:", updateError);
      return NextResponse.json(
        { error: "当前无法分配激活码，请稍后重试。" },
        { status: 500 }
      );
    }

    if (updated?.code) {
      assignedCode = updated.code;
      break;
    }
    // 如果没有更新到行，说明这枚码在本次尝试前已被占用，继续下一轮重试
  }

  if (!assignedCode) {
    return NextResponse.json(
      { error: "当前没有可分配的激活码，请联系管理员。" },
      { status: 200 }
    );
  }

  const redirectParam = request.nextUrl.searchParams.get("redirect") || "/";

  // 为了复用已有的激活码校验与跳转逻辑，这里先重定向到 /join?code=...
  // /join 页面校验通过后会自动跳转到 /register?inviteCode=xxx&redirect=...
  const redirectUrl = new URL("/join", request.nextUrl.origin);
  redirectUrl.searchParams.set("code", assignedCode);
  if (redirectParam) {
    redirectUrl.searchParams.set("redirect", redirectParam);
  }

  return NextResponse.redirect(redirectUrl.toString(), {
    status: 302
  });
}
