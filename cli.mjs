#!/usr/bin/env node
//@ts-check
import { basename } from "path";
import { createServer } from "http";
import chokidar from "chokidar";
/*
 * esbuild mangles the import -> require conversion
 * appends `.default` and shows `startService is undefined`
 */
const esbuild = require("esbuild");
import mri from "mri";
import serveHandler from "serve-handler";
import { gray, red, green, yellow, cyan } from "colorette";
const cliArgs = [
  {
    long: "watch",
    default: [],
    type: "string[]",
    description: "one or many directories to watch for changes",
  },
  {
    long: "serve",
    type: "boolean",
    default: false,
    description: "serve app locally",
  },
  {
    long: "public",
    short: "u",
    type: "string",
    default: "public",
    description: "the directory to serve",
  },
  {
    long: "port",
    type: "number",
    default: 5000,
    description: "the port to serve",
  },
  {
    long: "verbose",
    type: "boolean",
    default: false,
    description: "enable more detailed logs",
  },
  {
    long: "nomodule",
    type: "boolean",
    default: "false",
    description: "generate the es2015 fallback bundle",
  },
  {
    long: "minify",
    type: "boolean",
    default: false,
    description: "minify all output",
  },
  {
    long: "jsxFactory",
    type: "string",
    default: "h",
    description: "jsx render function to use for nodes",
  },
  {
    long: "jsxFragment",
    type: "string",
    default: "Fragment",
    description: "jsx render function to use for fragments",
  },
  {
    long: "help",
    type: "boolean",
    default: false,
    description: "display this message",
  },
];

let aliases = {},
  defaults = {};
const booleans = cliArgs
  .filter(({ type }) => type === "boolean")
  .map(({ name }) => name);

cliArgs.forEach((arg) => {
  const short = arg.short || arg.long.slice(0, 1);
  aliases[short] = arg.long;
  if (arg.default) {
    defaults[arg.long] = arg.default;
  }
});

const {
  watch: _watch,
  serve,
  public: rawPublic,
  port,
  verbose: _verbose,
  nomodule,
  minify,
  jsxFactory,
  jsxFragment,
  help,
  _: entryPoints,
} = mri(process.argv.slice(2), {
  // @ts-ignore object is initialized empty but guaranteed to be populated
  alias: aliases,
  boolean: booleans,
  default: defaults,
});

if (help) {
  console.log(
    `${cyan("lebeben")}
=======

${cliArgs.map(
  ({ long, short: _short, type, default: _default, description }, index) => {
    const short = _short || long.slice(0, 1);
    return `${index !== 0 ? "\n\n" : ""}-${cyan(short)}, --${cyan(long)} ${gray(
      type
    )}${_default ? gray("=" + _default.toString()) : ""}
  ${description}`;
  }
)}

<entryFiles> ${gray("string[]")}
  the path(s) to entrypoints for the app to be built
`
  );
  process.exit(0);
}

const toWatch = [].concat(_watch);
const watch = toWatch.length > 0;
const verbose = !_verbose ? () => null : (_) => console.log(gray(_));
const _public =
  rawPublic && rawPublic.slice(-1) === "/" ? rawPublic.slice(0, -1) : rawPublic;
const incremental = watch;

const watcher = watch
  ? chokidar.watch(toWatch, {
      persistent: true,
    })
  : {};

if (serve) {
  createServer((request, response) =>
    serveHandler(request, response, {
      public: _public,
    })
  ).listen(port, () => {
    console.log(cyan(`Serving ${_public} at http://localhost:${port}`));
  });
}

const esbuildOptions = {
  entryPoints,
  bundle: true,
  platform: "browser",
  sourcemap: true,
  jsxFactory,
  jsxFragment,
  incremental,
  loader: {
    ".md": "text",
  },
};
async function build({ service, path }) {
  const hr = process.hrtime();
  const res = await service.build({
    ...esbuildOptions,
    outdir: `${_public}/module`,
    format: "esm",
    target: "es2020",
    minify,
  });
  if (nomodule) {
    await service.build({
      ...esbuildOptions,
      format: "iife",
      target: "es2015",
      outdir: `${_public}/nomodule`,
      minify,
    });
  }
  const [s, ms] = process.hrtime(hr);
  const time = Math.floor(ms / 1000000);
  const format = time < 100 ? green : time < 500 ? yellow : red;
  console.log(
    `⏱️  ${format(time > 999 ? `${s}s` : `${time}ms`)} ${gray(basename(path))}`
  );
  return res;
}

(async () => {
  const service = await esbuild.startService();
  await build({ service, path: "init" });

  if (!watch) {
    await service.stop();
    process.exit(0);
  }

  verbose("Started esbuild service");

  console.log(
    `👀 ${
      toWatch.length === 1
        ? green(toWatch[0])
        : `[${toWatch.map((w) => green(w)).join(" ")}]`
    }`
  );

  watcher.on("change", async (path) => {
    try {
      await build({ service, path });
    } catch (e) {
      console.error(red(`Failed to rebuild after ${path} change`));
      _verbose && console.error(e);
    }
  });
})();
