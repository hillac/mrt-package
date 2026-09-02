import typescript from '@rollup/plugin-typescript'
import copy from 'rollup-plugin-copy'
import del from 'rollup-plugin-delete'
import dts from 'rollup-plugin-dts'
import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import postcss from 'rollup-plugin-postcss'

const external = [
  '@mantine/core',
  '@mantine/dates',
  '@mantine/hooks',
  '@tabler/icons-react',
  '@tanstack/match-sorter-utils',
  '@tanstack/react-store',
  '@tanstack/react-table',
  '@tanstack/react-virtual',
  'clsx',
  'dayjs',
  'react',
  'react-dom',
  'react/jsx-runtime',
]

export default [
  {
    input: './src/index.ts',
    external,
    output: {
      file: './dist/index.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      peerDepsExternal(),
      typescript({
        rootDir: './src',
        declaration: true,
        declarationDir: './dist/types',
        sourceMap: true,
      }),
      postcss({
        extract: true,
        minimize: false,
        modules: true,
      }),
    ],
  },
  {
    input: './dist/types/index.d.ts',
    external,
    output: {
      file: './dist/index.d.ts',
      format: 'esm',
    },
    plugins: [
      copy({
        hook: 'buildStart',
        targets: [
          {
            src: './dist/index.css',
            dest: './',
            rename: 'styles.css',
          },
        ],
      }),
      dts(),
      del({
        hook: 'buildEnd',
        targets: ['./dist/index.css', './dist/types'],
      }),
    ],
  },
]
