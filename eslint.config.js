'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['dist/**', 'index.html', 'node_modules/**', '.superpowers/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.gs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script'
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['build.js', 'eslint.config.js', 'scripts/**/*.js', 'src/top-strip.js', 'tests/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node
    }
  },
  {
    files: ['Code.gs'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        HtmlService: 'readonly',
        Session: 'readonly',
        SpreadsheetApp: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'off'
    }
  },
  {
    files: ['src/js/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        Chart: 'readonly',
        google: 'readonly',
        lucide: 'readonly',
        module: 'writable'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off'
    }
  },
  {
    files: ['src/js/__default_bundle_with_tests.js', 'src/js/__sales_rep_bundle_with_tests.js'],
    languageOptions: {
      globals: {
        __chartDatasets: 'readonly',
        __chartInstances: 'readonly',
        __domReadyHandler: 'readonly'
      }
    }
  },
  {
    files: ['src/js/__sales_rep_bundle.js', 'src/js/__sales_rep_bundle_with_tests.js'],
    languageOptions: {
      globals: {
        state: 'readonly'
      }
    }
  },
  {
    files: ['tests/[0-9]*.test.js'],
    rules: {
      'no-undef': 'off'
    }
  }
];
