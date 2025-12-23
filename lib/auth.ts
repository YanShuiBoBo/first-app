
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * 模拟用户认证系统（带激活码校验）
 * 当前阶段仍使用前端内存用户 + 自制 token，
 * 但激活码的生成 / 使用状态改为真实写入 Supabase(access_codes) 表。
 */

// 默认管理员账号
export const defaultAdminUser = {
  email: "772861967@qq.com",
  password: "zhdnfzzb1", // 注意：在实际项目中不要存储明文密码
  name: "张管理员",
  role: "admin"
};

// 生成前端自用 token（base64(JSON)）
function createToken(user: { email: string; role: string; name: string }) {
  return Buffer.from(
    JSON.stringify({
      email: user.email,
      role: user.role,
      name: user.name,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24小时后过期
    })
  ).toString('base64');
}

// 登录函数：支持管理员 + 存储在 app_users 表中的普通用户
export const login = async (email: string, password: string) => {
  // 优先匹配管理员账号
  if (email === defaultAdminUser.email && password === defaultAdminUser.password) {
    const token = createToken(defaultAdminUser);
    return {
      success: true,
      token,
      user: defaultAdminUser
    };
  }

  // 再在数据库 app_users 中查找
  const supabase = createBrowserClient();

  const { data, error } = await supabase
    .from("app_users")
    .select("email, password, name, role")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("查询用户失败:", error);
    return {
      success: false,
      error: "登录失败，请稍后重试"
    };
  }

  if (!data) {
    return {
      success: false,
      error: "用户名或密码错误"
    };
  }

  if (data.password !== password) {
    return {
      success: false,
      error: "用户名或密码错误"
    };
  }

  const user = {
    email: data.email,
    name: data.name || data.email.split("@")[0],
    role: data.role || "user"
  };

  const token = createToken(user);

  return {
    success: true,
    token,
    user
  };
};

// 激活码校验 + 注册函数（使用 app_users 表持久化用户）
export const register = async (
  email: string,
  password: string,
  inviteCode: string,
  options?: {
    nickname?: string;
    phone?: string;
  }
) => {
  const code = inviteCode.trim();
  const nickname = options?.nickname?.trim() || "";
  const phone = options?.phone?.trim() || "";

  if (!code) {
    return {
      success: false,
      error: "请输入激活码"
    };
  }

  const supabase = createBrowserClient();

  try {
    // 检查用户是否已存在
    const { data: existingUser, error: userCheckError } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (userCheckError) {
      console.error("检查用户是否存在失败:", userCheckError);
      return {
        success: false,
        error: "注册失败，请稍后重试"
      };
    }

    if (existingUser) {
      return {
        success: false,
        error: "用户已存在"
      };
    }

    const now = new Date();

    // 查找对应激活码
    const { data: codeRow, error: fetchError } = await supabase
      .from("access_codes")
      .select("code, status, valid_days, activated_at, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (fetchError) {
      console.error("查询激活码失败:", fetchError);
      return {
        success: false,
        error: "激活码校验失败，请稍后重试"
      };
    }

    if (!codeRow) {
      return {
        success: false,
        error: "激活码不存在"
      };
    }

    // 状态检查
    if (codeRow.status === "expired") {
      return {
        success: false,
        error: "激活码已过期"
      };
    }

    if (codeRow.status === "active") {
      return {
        success: false,
        error: "激活码已被使用"
      };
    }

    // 时间 / 有效期检查
    if (codeRow.expires_at) {
      const exp = new Date(codeRow.expires_at);
      if (!Number.isNaN(exp.getTime()) && exp <= now) {
        return {
          success: false,
          error: "激活码已过期"
        };
      }
    }

    // 激活码通过校验后，先创建用户，再占用激活码

    // 创建用户（带昵称 / 手机号）
    const { data: createdUser, error: createUserError } = await supabase
      .from("app_users")
      .insert({
        email,
        password, // 当前阶段明文存储，仅用于开发环境
        name: nickname || email.split("@")[0],
        role: "user",
        phone: phone || null
      })
      .select("email, name, role")
      .single();

    if (createUserError) {
      console.error("创建用户失败:", createUserError);
      return {
        success: false,
        error: "注册失败，请稍后重试"
      };
    }

    // 标记激活码为已使用（active）
    // 为了避免并发重复使用，这里加上 status = 'unused' 的条件
    const { data: updatedRow, error: updateError } = await supabase
      .from("access_codes")
      .update({
        status: "active",
        activated_at: now.toISOString()
        // 暂不写 user_id，等待后续接入 Supabase Auth
      })
      .eq("code", code)
      .eq("status", "unused")
      .select("code")
      .maybeSingle();

    if (updateError) {
      console.error("更新激活码状态失败:", updateError);
      return {
        success: false,
        error: "激活码校验失败，请稍后重试"
      };
    }

    // 如果没有行被更新，说明在这一步之前激活码已被其他请求占用
    if (!updatedRow) {
      return {
        success: false,
        error: "激活码已被使用"
      };
    }

    // 注册成功，返回用户信息 + token
    const user = {
      email: createdUser.email,
      name: createdUser.name || createdUser.email.split("@")[0],
      role: createdUser.role || "user"
    };

    const token = createToken(user);

    return {
      success: true,
      token,
      user
    };
  } catch (err) {
    console.error("激活码校验过程中出错:", err);
    return {
      success: false,
      error: "激活码校验失败，请稍后重试"
    };
  }
};

// 验证 token 函数 - 修复中文乱码问题
export const verifyToken = (token: string) => {
  try {
    // 使用 decodeURIComponent 和解码处理中文
    const decodedData = JSON.parse(
      decodeURIComponent(
        atob(token)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    );

    // 检查 token 是否过期
    if (decodedData.exp < Date.now() / 1000) {
      return null;
    }
    return decodedData;
  } catch (error) {
    try {
      // 兼容旧的解码方式
      const decoded = JSON.parse(atob(token));

      // 检查 token 是否过期
      if (decoded.exp < Date.now() / 1000) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }
};
