
"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { register } from '@/lib/auth';
import { useAuthStore } from '@/lib/store/auth-store';

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const redirect = searchParams ? searchParams.get('redirect') || '/' : '/';
  const initialInviteCode = searchParams
    ? searchParams.get('inviteCode') || ''
    : '';

  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const loginAction = useAuthStore(state => state.login);

  // 如果 URL 中带有 inviteCode 参数，则在初次加载时自动填充邀请码输入框
  useEffect(() => {
    const codeFromUrl = searchParams
      ? searchParams.get('inviteCode') || ''
      : '';

    if (codeFromUrl && !inviteCode) {
      setInviteCode(codeFromUrl);
    }
  }, [searchParams, inviteCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // 表单验证
    if (password !== confirmPassword) {
      setError('两次密码输入不一致');
      setIsLoading(false);
      return;
    }

    if (!inviteCode) {
      setError('请输入邀请码');
      setIsLoading(false);
      return;
    }

    // 简单手机号校验（仅判断非空和长度）
    if (!nickname.trim()) {
      setError('请输入昵称');
      setIsLoading(false);
      return;
    }

    if (!phone.trim()) {
      setError('请输入手机号');
      setIsLoading(false);
      return;
    }

    try {
      // 调用注册函数
      const result = await register(email, password, inviteCode, {
        nickname,
        phone
      });

      if (!result.success) {
        setError(result.error || '注册失败');
        setIsLoading(false);
        return;
      }

      // 登录成功，更新状态
      if (result.user) {
        loginAction(result.user, result.token);
      }

      // 重定向到原页面
      router.push(redirect);

    } catch (err) {
      setError('注册失败，请检查信息是否正确');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 rounded-xl shadow-md p-8">
        <div>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
              IE
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            注册 Immersive English
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
            或{' '}
            <Link
              href={`/login?redirect=${redirect}`}
              className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
            >
              已有账号，直接登录
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900 p-3 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                邮箱地址
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-t-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="邮箱地址"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="nickname" className="sr-only">
                昵称
              </label>
              <input
                id="nickname"
                name="nickname"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="昵称（展示在首页头像旁）"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="phone" className="sr-only">
                手机号
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="手机号（用于后续通知）"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="invite-code" className="sr-only">
                邀请码
              </label>
              <input
                id="invite-code"
                name="inviteCode"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="邀请码"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="sr-only">
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="sr-only">
                确认密码
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-b-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="确认密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                isLoading ? 'bg-blue-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors`}
            >
              {isLoading ? '注册中...' : '注册'}
            </button>
          </div>
        </form>

        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          <p>注册即表示您同意我们的</p>
          <div className="mt-1 space-x-2">
            <Link href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
              服务条款
            </Link>
            <span>和</span>
            <Link href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
              隐私政策
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
