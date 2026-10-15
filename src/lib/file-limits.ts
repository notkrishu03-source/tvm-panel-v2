/**
 * Shared between server routes and client components, so it must not import
 * anything server-only.
 */

export const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB per file
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB per VM
export const MAX_FILES_PER_VM = 400;

export function joinPath(parent: string, name: string): string {
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|conf|cfg|ini|ya?ml|json|xml|sh|bash|zsh|js|mjs|cjs|ts|tsx|jsx|css|scss|less|html?|env|log|toml|py|rb|php|sql|service|properties|gitignore)$/i;

export function looksLikeText(name: string, mimeType: string): boolean {
  return mimeType.startsWith("text/") || mimeType === "application/json" || TEXT_EXTENSIONS.test(name);
}
