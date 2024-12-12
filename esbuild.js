const esbuild = require('esbuild');
const { resolve } = require('path');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const stylePlugin = require('esbuild-style-plugin');
const svgr = require('esbuild-plugin-svgr');
const babelFlowPlugin = require('./esbuild/flow-plugin');
const { resolveFeatureFlags } = require('react-devtools-shared/buildUtils.js');
const { GITHUB_URL, getVersionString } = require('react-devtools-extensions/utils');
const { copyDirectory } = require('./src/utils/files');
const { esbuildProblemMatcherPlugin, copyFilesPlugin } = require('./src/esbuild-plugins');

// TODO should keep these build commands flags separate for consistency w/ react?
const NODE_ENV = process.env.NODE_ENV || 'development';
const EDITOR_URL = process.env.EDITOR_URL || null;
const LOGGING_URL = process.env.LOGGING_URL || null;

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

if (!NODE_ENV) {
  console.error('NODE_ENV not set');
  process.exit(1);
}

const builtModulesDir = resolve(__dirname, 'react', 'build', 'oss-experimental');

const __DEV__ = JSON.stringify(NODE_ENV === 'development');

const DEVTOOLS_VERSION = getVersionString();

const featureFlagTarget = process.env.FEATURE_FLAG_TARGET || 'core/backend-oss';

async function devtools() {
  await copyDirectory('../react/packages/react-devtools-core/dist', './dist/devtools/react/', {
    ignore: ['standalone.*'],
  });

  const ctx = await esbuild.context({
    entryPoints: ['src/devtools/react/src/standalone.js'],
    bundle: true,
    format: 'esm',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    external: ['vscode'],
    outdir: 'src/devtools/react/dist',
    allowOverwrite: true,
    alias: {
      'react-devtools-feature-flags': resolveFeatureFlags(featureFlagTarget),
      react: resolve(builtModulesDir, 'react'),
      'react-debug-tools': resolve(builtModulesDir, 'react-debug-tools'),
      'react-devtools-feature-flags': resolveFeatureFlags(featureFlagTarget),
      'react-dom/client': resolve(builtModulesDir, 'react-dom/client'),
      'react-dom': resolve(builtModulesDir, 'react-dom'),
      'react-is': resolve(builtModulesDir, 'react-is'),
      scheduler: resolve(builtModulesDir, 'scheduler'),
    },
    define: {
      __DEV__,
      __EXPERIMENTAL__: JSON.stringify(true),
      __EXTENSION__: JSON.stringify(false),
      __PROFILE__: JSON.stringify(false),
      __TEST__: JSON.stringify(NODE_ENV === 'test'),
      'process.env.DEVTOOLS_PACKAGE': `"cs-react-devtools-core"`,
      'process.env.DEVTOOLS_VERSION': `"${DEVTOOLS_VERSION}"`,
      'process.env.EDITOR_URL': EDITOR_URL !== null ? `"${EDITOR_URL}"` : JSON.stringify(null),
      'process.env.GITHUB_URL': `"${GITHUB_URL}"`,
      'process.env.LOGGING_URL': `"${LOGGING_URL}"`,
      'process.env.NODE_ENV': `"${NODE_ENV}"`,
    },
    // logLevel: 'silent',
    plugins: [
      babelFlowPlugin,
      // add to the end of plugins array
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

async function extension() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    external: ['vscode'],
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
    entryPoints: [
      'src/preview-src/preview-index.ts',
      'src/preview-src/sw.js',
      'src/preview-src/preview-main.css',
    ],
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
    console.log('Starting DevTools');
    await devtools();
    console.log('Starting Extension');
    extension();
    preview();
    webview();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
