const esbuild = require('esbuild');
const { resolve } = require('path');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const stylePlugin = require('esbuild-style-plugin');
const svgr = require('esbuild-plugin-svgr');
const babelFlowPlugin = require('./esbuild/flow-plugin');
const { esbuildProblemMatcherPlugin, copyFilesPlugin } = require('./src/esbuild-plugins');
const { copyDirectory } = require('./src/utils/files');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function extension() {
  await copyDirectory('src/devtools/react/dist', './dist', {
    ignore: ['standalone.*'],
  });

  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    external: ['vscode', 'bufferutil', 'utf-8-validate'],
    outfile: 'dist/extension.js',
    // logLevel: 'silent',
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    return await ctx.watch();
  } else {
    await ctx.rebuild();
    return await ctx.dispose();
  }
}

async function webview() {
  const ctx = await esbuild.context({
    entryPoints: ['src/webviews/index.tsx', 'src/webviews/style.css'],
    bundle: true,
    format: 'esm',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outdir: 'dist',
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"',
      'process.env.IS_PRODUCTION': production ? 'true' : 'false',
    },
    // logLevel: 'silent',
    plugins: [
      stylePlugin({
        postcss: {
          plugins: [tailwindcss, autoprefixer],
        },
      }),
      svgr(),
      copyFilesPlugin([{ from: './src/icon.png', to: 'icon.png' }]),
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
    loader: {
      '.svg': 'file',
      '.ttf': 'file',
    },
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

async function preview() {
  const ctx = await esbuild.context({
    entryPoints: ['src/preview-src/preview-index.ts', 'src/preview-src/preview-main.css'],
    bundle: true,
    format: 'esm',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outdir: 'dist',
    // external: ['./sw.js'],
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"',
      'process.env.IS_PRODUCTION': production ? 'true' : 'false',
    },
    // logLevel: 'silent',
    plugins: [
      //  copyFilesPlugin([{ from: './src/preview-src/icon.png', to: 'preview-icon.png' }]),
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
    loader: {
      '.svg': 'file',
      '.ttf': 'file',
    },
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

(async () => {
  try {
    extension();
    preview();
    webview();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
