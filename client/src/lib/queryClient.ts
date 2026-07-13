import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiUrl } from "@/lib/apiUrl";
import { getSupabaseAccessToken } from "@/lib/supabaseSession";

async function authHeaders(data?: unknown): Promise<HeadersInit> {

  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  const accessToken = await getSupabaseAccessToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

export function getAuthHeaders(data?: unknown): Promise<HeadersInit> {
  return authHeaders(data);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(apiUrl(url), {
    method,
    headers: await authHeaders(data),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(apiUrl(queryKey.join("/") as string), {
      headers: await authHeaders(),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {

      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
