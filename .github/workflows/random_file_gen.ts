#!/usr/bin/env ts-node

import { promises as fs } from "fs";
import * as path from "path";
import { randomBytes } from "crypto";

type Options = {
  outDir: string;
  count: number;
  minLen: number;
  maxLen: number;
  maxDepth: number;
};

const DEFAULTS: Options = {
  outDir: path.resolve(process.cwd(), "dist"),
  count: 20,
  minLen: 50,
  maxLen: 500,
  maxDepth: 3,
};

const exts = [".html", ".js", ".css", ".txt"];
const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function rndInt(min: number, max: number) {
  // inclusive min, inclusive max
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rndHex(len = 8) {
  return randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function rndString(len: number) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return out;
}

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function makeRandomDir(base: string, maxDepth: number) {
  const depth = rndInt(1, Math.max(1, maxDepth));
  const parts = [];
  for (let i = 0; i < depth; i++) {
    parts.push(rndHex(6));
  }
  const dir = path.join(base, ...parts);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function makeRandomFile(dir: string, minLen: number, maxLen: number) {
  const ext = pick(exts);
  const name = `file_${rndHex(8)}${ext}`;
  const len = rndInt(minLen, maxLen);
  const content = rndString(len);

  // for .html/.js/.css we can optionally wrap a tiny valid snippet (not necessary, but nicer)
  let finalContent = content;
  if (ext === ".html") {
    finalContent = `<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>${rndHex(6)}</title>\n</head>\n<body>\n${content}\n</body>\n</html>\n`;
  } else if (ext === ".js") {
    finalContent = `// ${rndHex(6)}\n(function(){\n  const s = "${content}";\n  // random content\n  return s.length;\n})();\n`;
  } else if (ext === ".css") {
    finalContent = `/* ${rndHex(6)} */\nbody::after { content: "${content.slice(0, 30)}"; }\n`;
  }

  const fullPath = path.join(dir, name);
  await fs.writeFile(fullPath, finalContent, "utf8");
  return fullPath;
}

async function main() {
  // simple CLI parsing: --count N --min N --max N --out dir --depth N
  const argv = process.argv.slice(2);
  const opts = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--count" && argv[i + 1]) {
      opts.count = parseInt(argv[++i], 10) || opts.count;
    } else if (a === "--min" && argv[i + 1]) {
      opts.minLen = parseInt(argv[++i], 10) || opts.minLen;
    } else if (a === "--max" && argv[i + 1]) {
      opts.maxLen = parseInt(argv[++i], 10) || opts.maxLen;
    } else if (a === "--out" && argv[i + 1]) {
      opts.outDir = path.resolve(process.cwd(), argv[++i]);
    } else if (a === "--depth" && argv[i + 1]) {
      opts.maxDepth = parseInt(argv[++i], 10) || opts.maxDepth;
    } else if (a === "--help" || a === "-h") {
      console.log(usage());
      process.exit(0);
    }
  }

  // sanity
  if (opts.minLen < 0) opts.minLen = 0;
  if (opts.maxLen < opts.minLen) opts.maxLen = opts.minLen;

  await fs.mkdir(opts.outDir, { recursive: true });

  const created: string[] = [];
  for (let i = 0; i < opts.count; i++) {
    const dir = await makeRandomDir(opts.outDir, opts.maxDepth);
    const file = await makeRandomFile(dir, opts.minLen, opts.maxLen);
    created.push(file);
  }

  console.log(`Created ${created.length} files under ${opts.outDir}`);
  for (const f of created) {
    console.log(" -", path.relative(process.cwd(), f));
  }
}

function usage() {
  return `
Usage: ts-node make-random-files.ts [options]

Options:
  --count N     Number of files to create (default: ${DEFAULTS.count})
  --min N       Minimum characters per file content (default: ${DEFAULTS.minLen})
  --max N       Maximum characters per file content (default: ${DEFAULTS.maxLen})
  --out DIR     Output base directory (default: ./dist)
  --depth N     Max random directory depth (default: ${DEFAULTS.maxDepth})
  --help, -h    Show this help
`;
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
