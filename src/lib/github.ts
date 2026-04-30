/**
 * Helper minimale per le API GitHub usate da Moneybird:
 *   - createIssue: snapshot di debug → issue su `marcomiraglia1985/moneybird`
 *   - uploadFile: upload di file (es. dev.db.gz) via Contents API
 *   - getLatestRelease: per il check update notifier
 *
 * Auth: PAT in `GITHUB_TOKEN` env. Repo target in `GITHUB_REPO` env (formato
 * "owner/repo"). Entrambe configurate in `.env`.
 *
 * Niente dipendenze esterne (no @octokit) — fetch native + JSON.
 */

const API = "https://api.github.com";

function getEnv(): { token: string; owner: string; repo: string } {
  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPO;
  if (!token || !repoFull) {
    throw new Error(
      "GITHUB_TOKEN e GITHUB_REPO devono essere configurati in .env",
    );
  }
  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) {
    throw new Error(`GITHUB_REPO formato invalido: "${repoFull}" (atteso "owner/repo")`);
  }
  return { token, owner, repo };
}

async function gh<T>(
  path: string,
  init: RequestInit & { body?: BodyInit | object } = {},
): Promise<T> {
  const { token } = getEnv();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Moneybird-App",
  };
  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    if (typeof init.body === "object" && !(init.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    } else {
      body = init.body as BodyInit;
    }
  }
  const res = await fetch(`${API}${path}`, { ...init, headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type CreatedIssue = {
  number: number;
  html_url: string;
  title: string;
};

export async function createIssue(
  title: string,
  body: string,
  labels: string[] = [],
): Promise<CreatedIssue> {
  const { owner, repo } = getEnv();
  return gh<CreatedIssue>(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: { title, body, labels },
  });
}

export type UploadedFile = {
  content: { html_url: string; download_url: string; sha: string; path: string };
};

/**
 * Upload binario via Contents API. Path relativo alla repo (es.
 * "snapshots/2026-04-30.db.gz"). Se il file esiste, fallisce: usa un path
 * univoco (timestamp).
 */
export async function uploadFile(
  path: string,
  content: Buffer,
  commitMessage: string,
  branch = "main",
): Promise<UploadedFile> {
  const { owner, repo } = getEnv();
  return gh<UploadedFile>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: {
      message: commitMessage,
      content: content.toString("base64"),
      branch,
    },
  });
}

export type Release = {
  tag_name: string;
  name: string;
  html_url: string;
  body: string;
  published_at: string;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
};

/**
 * Ultima release pubblicata (non draft). Usato dall'update notifier.
 * Ritorna null se non ci sono ancora release.
 */
export async function getLatestRelease(): Promise<Release | null> {
  const { owner, repo } = getEnv();
  try {
    return await gh<Release>(`/repos/${owner}/${repo}/releases/latest`);
  } catch (e) {
    // 404 = nessuna release ancora pubblicata
    if (e instanceof Error && e.message.includes("→ 404")) return null;
    throw e;
  }
}
