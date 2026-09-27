import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["vendor/", "spikes/", ".output/", ".wxt/", "node_modules/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...pluginVue.configs["flat/recommended"],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".vue"],
        parser: tseslint.parser,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
    },
  },
  { files: ["eslint.config.js"], ...tseslint.configs.disableTypeChecked },
);
