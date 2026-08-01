const BASE_URL = 'https://openapi.tidal.com/v2';

/**
 * Token-Quelle ist injizierbar: im Browser das Tidal-Auth-SDK (setzt auth.ts),
 * auf dem Auto-Generierungs-Server der Refresh-Token-Flow.
 */
let tokenProvider: () => Promise<string> = async () => {
  throw new Error('Kein Token-Provider gesetzt (setTokenProvider aufrufen)');
};

export function setTokenProvider(provider: () => Promise<string>): void {
  tokenProvider = provider;
}

export type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string }[] | { id: string; type: string } }>;
  meta?: Record<string, unknown>;
};

export type JsonApiDocument = {
  data?: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
  links?: { next?: string };
};

function toArray(data: JsonApiDocument['data']): JsonApiResource[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/**
 * Roher Fetch gegen die Tidal-API mit Auth-Header, Backoff bei 429/5xx.
 */
async function apiFetch(
  pathWithQuery: string,
  options: { method?: string; body?: unknown } = {},
): Promise<JsonApiDocument | null> {
  const url = pathWithQuery.startsWith('http')
    ? pathWithQuery
    : `${BASE_URL}${pathWithQuery.startsWith('/v2/') ? pathWithQuery.slice(3) : pathWithQuery}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = await tokenProvider();
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.api+json',
        ...(options.body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('Retry-After')) || 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Tidal API ${response.status} bei ${url}: ${text.slice(0, 300)}`);
    }
    if (response.status === 204) return {};
    const text = await response.text();
    return text ? (JSON.parse(text) as JsonApiDocument) : {};
  }
  throw new Error(`Tidal API dauerhaft überlastet (429/5xx): ${url}`);
}

export async function apiGet(path: string, params: Record<string, string> = {}): Promise<JsonApiDocument | null> {
  const query = new URLSearchParams(params).toString();
  return apiFetch(query ? `${path}?${query}` : path);
}

export async function apiPost(path: string, body: unknown, params: Record<string, string> = {}): Promise<JsonApiDocument | null> {
  const query = new URLSearchParams(params).toString();
  return apiFetch(query ? `${path}?${query}` : path, { method: 'POST', body });
}

export async function apiPatch(path: string, body: unknown, params: Record<string, string> = {}): Promise<JsonApiDocument | null> {
  const query = new URLSearchParams(params).toString();
  return apiFetch(query ? `${path}?${query}` : path, { method: 'PATCH', body });
}

export async function apiDelete(path: string, body: unknown): Promise<JsonApiDocument | null> {
  return apiFetch(path, { method: 'DELETE', body });
}

/**
 * Folgt links.next, bis maxItems Ressourcen gesammelt sind.
 * Liefert data-Einträge (in Reihenfolge) und alle included-Ressourcen.
 */
export async function apiGetPaginated(
  path: string,
  params: Record<string, string>,
  maxItems: number,
): Promise<{ data: JsonApiResource[]; included: JsonApiResource[] }> {
  const data: JsonApiResource[] = [];
  const included: JsonApiResource[] = [];
  let document = await apiGet(path, params);

  while (document) {
    data.push(...toArray(document.data));
    if (document.included) included.push(...document.included);
    if (data.length >= maxItems || !document.links?.next) break;
    document = await apiFetch(document.links.next);
  }
  return { data: data.slice(0, maxItems), included };
}

/** Index über included-Ressourcen: type → id → resource */
export function indexIncluded(resources: JsonApiResource[]): Map<string, Map<string, JsonApiResource>> {
  const index = new Map<string, Map<string, JsonApiResource>>();
  for (const resource of resources) {
    if (!index.has(resource.type)) index.set(resource.type, new Map());
    index.get(resource.type)!.set(resource.id, resource);
  }
  return index;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
