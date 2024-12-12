const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const babelFlowPlugin = {
  name: 'babel-flow',
  setup(build) {
    build.onLoad({ filter: /\.js$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      const result = await babel.transformAsync(source, {
        filename: args.path,
        presets: ['@babel/preset-flow'],
        sourceMaps: true,
      });
      let code = result.code;
      // Inline the source map if it exists
      if (result.map) {
        const dataUrl =
          'data:application/json;base64,' +
          Buffer.from(JSON.stringify(result.map)).toString('base64');
        code += `\n//# sourceMappingURL=${dataUrl}`;
      }
      return {
        contents: code,
        loader: 'js',
      };
    });
  },
};

module.exports = babelFlowPlugin;
