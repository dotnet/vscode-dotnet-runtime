//@ts-check

'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
module.exports = {
  entry: './src/ExtensionUninstall.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'ExtensionUninstall.js',
    path: path.resolve(__dirname, 'dist'),
  },
  target: 'node',
  node: {
    fs: 'empty'
  }
};