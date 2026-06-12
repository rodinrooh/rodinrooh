export const DOCS_MAP: Record<string, string> = {
  javascript: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  js: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  typescript: "https://www.typescriptlang.org/docs/",
  ts: "https://www.typescriptlang.org/docs/",
  python: "https://docs.python.org/3/",
  go: "https://pkg.go.dev/",
  golang: "https://pkg.go.dev/",
  rust: "https://doc.rust-lang.org/",
  java: "https://docs.oracle.com/en/java/",
  "c++": "https://en.cppreference.com/",
  cpp: "https://en.cppreference.com/",
  ruby: "https://ruby-doc.org/",
  php: "https://www.php.net/docs.php",
  swift: "https://developer.apple.com/documentation/swift",
  kotlin: "https://kotlinlang.org/docs/",
  sql: "https://www.sql-easy.com/",
  bash: "https://www.gnu.org/software/bash/manual/",
  shell: "https://www.gnu.org/software/bash/manual/",
  html: "https://developer.mozilla.org/en-US/docs/Web/HTML",
  css: "https://developer.mozilla.org/en-US/docs/Web/CSS",
  react: "https://react.dev/reference/react",
};

export function getDocsUrl(lang: string): string | undefined {
  return DOCS_MAP[lang.toLowerCase()];
}
