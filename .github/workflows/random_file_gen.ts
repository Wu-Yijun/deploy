import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

type Options = {
  outDir: string;
  count: number;
  overlap: number;
  minLen: number;
  maxLen: number;
  maxDepth: number;
};

const DEFAULTS: Options = {
  outDir: path.resolve(process.cwd(), "dist"),
  count: 30,
  overlap: 0.6,
  minLen: 50,
  maxLen: 500,
  maxDepth: 4,
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

type Dir = [string, Dir][];
class RandomDir {
  base: string;
  max_depth: number;
  rate: number;
  constructor(base: string, max_depth: number, rate: number) {
    this.base = base;
    this.max_depth = max_depth;
    this.rate = rate;
    this.dirs = [];
  }
  private dirs: Dir;
  async path() {
    const depth = rndInt(1, Math.max(1, this.max_depth));
    const dir = path.join(this.base, ...this.randomPath(this.dirs, depth));
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }
  private create(depth: number): string[] {
    const parts = [];
    for (let i = 0; i < depth; i++) {
      parts.push(rndHex(6));
    }
    return parts;
  }
  private randomPath(dirs: Dir, depth: number): string[] {
    let parts: string[] = [];
    while (Math.random() < this.rate) {
      if (dirs.length === 0) {
        break;
      }
      const next = dirs[Math.floor(Math.random() * dirs.length)];
      parts.push(next[0]);
      dirs = next[1];
      // go inside
      depth--;
      if (depth <= 0) {
        return parts;
      }
    }
    // create left depth
    const folders = this.create(depth);
    folders.reduce((f, name, i) => {
      const subdir: Dir = [];
      f.push([name, subdir]);
      return subdir;
    }, dirs);
    parts.push(...folders);
    return parts;
  }
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
    } else if (a === "--overlap" && argv[i + 1]) {
      opts.overlap = parseFloat(argv[++i]) || opts.overlap;
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
  opts.overlap = Math.max(0, Math.min(1, opts.overlap));

  await fs.mkdir(opts.outDir, { recursive: true });

  const created: string[] = [];
  const randomDir = new RandomDir(opts.outDir, opts.maxDepth, opts.overlap);
  for (let i = 0; i < opts.count; i++) {
    // const { dir, parts } = await makeRandomDir(opts.outDir, opts.maxDepth);
    const dir = await randomDir.path();
    // console.log(dir);
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
  --overlap N   Overlap rate (0.0-1.0) of file to appear in same folder(default:  ${DEFAULTS.overlap})
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
