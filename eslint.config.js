const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.artifacts/*', 'product-handoff/*', 'src/design/generated/*']),
  expoConfig,
]);
