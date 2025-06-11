"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuthStore } from "@/lib/store/auth";
import { loginFormSchema } from "@/lib/schemas/auth";
import type { JellyfinConfig } from "@/types/jellyfin";

const STORAGE_KEYS = {
  SERVER_URL: "jellyfin-server-url",
  USERNAME: "jellyfin-username",
  PASSWORD: "jellyfin-password",
} as const;

export default function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((state) => state.login);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<JellyfinConfig>({
    resolver: zodResolver(loginFormSchema),
  });

  // Watch form values to save them to localStorage
  const watchedValues = watch();

  // Load saved values from localStorage on component mount
  useEffect(() => {
    const savedServerUrl = localStorage.getItem(STORAGE_KEYS.SERVER_URL);
    const savedUsername = localStorage.getItem(STORAGE_KEYS.USERNAME);
    const savedPassword = localStorage.getItem(STORAGE_KEYS.PASSWORD);

    if (savedServerUrl) {
      setValue("serverUrl", savedServerUrl);
    }
    if (savedUsername) {
      setValue("username", savedUsername);
    }
    if (savedPassword) {
      setValue("password", savedPassword);
    }
  }, [setValue]);

  // Save values to localStorage when they change
  useEffect(() => {
    if (watchedValues.serverUrl) {
      localStorage.setItem(STORAGE_KEYS.SERVER_URL, watchedValues.serverUrl);
    }
  }, [watchedValues.serverUrl]);

  useEffect(() => {
    if (watchedValues.username) {
      localStorage.setItem(STORAGE_KEYS.USERNAME, watchedValues.username);
    }
  }, [watchedValues.username]);

  useEffect(() => {
    if (watchedValues.password) {
      localStorage.setItem(STORAGE_KEYS.PASSWORD, watchedValues.password);
    }
  }, [watchedValues.password]);

  const onSubmit = async (data: JellyfinConfig) => {
    setIsLoading(true);
    setError(null);

    try {
      await login(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Connect to Jellyfin
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your Jellyfin server details to get started
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="serverUrl"
                className="block text-sm font-medium text-gray-700"
              >
                Server URL
              </label>
              <input
                {...register("serverUrl")}
                type="url"
                placeholder="https://your-jellyfin-server.com"
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              />
              {errors.serverUrl && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.serverUrl.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700"
              >
                Username
              </label>
              <input
                {...register("username")}
                type="text"
                autoComplete="username"
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                {...register("password")}
                type="password"
                autoComplete="current-password"
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
