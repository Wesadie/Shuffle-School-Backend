const rawApiUrl = import.meta.env.VITE_API_URL?.trim() || "";

const apiOrigin = rawApiUrl
  ? /^https?:\/\//i.test(rawApiUrl)
    ? rawApiUrl.replace(/\/$/, "")
    : `https://${rawApiUrl.replace(/\/$/, "")}`
  : "";

export function apiUrl(path: string) {
  if (!apiOrigin) return path;
  return `${apiOrigin}${path.startsWith("/") ? path : `/${path}`}`;
}
