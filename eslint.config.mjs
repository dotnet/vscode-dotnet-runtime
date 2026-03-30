import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";
import preferArrow from "eslint-plugin-prefer-arrow";
import header from "eslint-plugin-header";
import { fixupPluginRules } from "@eslint/compat";

// eslint-plugin-header v3.1.1 lacks a schema definition (ESLint 10 rejects
// options for schema-less rules) and uses deprecated context.getSourceCode().
// Patch the schema, then wrap with fixupPluginRules for API compatibility.
const headerWithSchema = {
    ...header,
    rules: {
        ...header.rules,
        header: {
            ...header.rules.header,
            meta: {
                ...header.rules.header.meta,
                schema: [
                    { type: "string" },
                    {
                        anyOf: [
                            { type: "string" },
                            { type: "object" },
                        ]
                    }
                ]
            }
        }
    }
};
const patchedHeader = fixupPluginRules(headerWithSchema);

export default tseslint.config(
    {
        ignores: [
            "**/node_modules/**",
            "**/.vscode-test/**",
            "**/dist/**",
            "**/test/**",
        ],
    },
    ...tseslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    eslintConfigPrettier,
    {
        files: ["**/*.ts"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.es2015,
            },
            parserOptions: {
                project: "tsconfig.eslint.json",
                sourceType: "module",
            },
        },
        plugins: {
            jsdoc,
            "prefer-arrow": preferArrow,
            header: patchedHeader,
        },
        rules: {
            "@typescript-eslint/adjacent-overload-signatures": "error",
            "@typescript-eslint/array-type": "off",
            "@typescript-eslint/consistent-type-assertions": "error",
            "@typescript-eslint/dot-notation": "error",
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/only-throw-error": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/naming-convention": [
                "off",
                {
                    "selector": "variable",
                    "format": [
                        "camelCase",
                        "UPPER_CASE"
                    ],
                    "leadingUnderscore": "forbid",
                    "trailingUnderscore": "forbid"
                }
            ],
            "@typescript-eslint/no-empty-interface": "error",
            "@typescript-eslint/no-unsafe-return": "warn",
            "@typescript-eslint/no-unsafe-call": "warn",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-inferrable-types": "error",
            "@typescript-eslint/no-misused-new": "error",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-shadow": [
                "error",
                {
                    "hoist": "all"
                }
            ],
            "@typescript-eslint/no-unused-expressions": "error",
            "@typescript-eslint/restrict-template-expressions": [
                "error",
                {
                    "allowNumber": true,
                    "allowBoolean": true,
                    "allowAny": true,
                    "allowArray": true
                }
            ],
            "@typescript-eslint/no-use-before-define": "off",
            "@typescript-eslint/prefer-for-of": "error",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/prefer-function-type": "error",
            "@typescript-eslint/prefer-namespace-keyword": "error",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
            "@typescript-eslint/quotes": "off",
            "@typescript-eslint/triple-slash-reference": [
                "error",
                {
                    "path": "always",
                    "types": "prefer-import",
                    "lib": "always"
                }
            ],
            "@typescript-eslint/typedef": "off",
            "@typescript-eslint/unified-signatures": "error",
            "arrow-parens": [
                "off",
                "always"
            ],
            "complexity": "off",
            "constructor-super": "error",
            "dot-notation": "off",
            "eqeqeq": [
                "error",
                "smart"
            ],
            "guard-for-in": "error",
            "id-denylist": "error",
            "id-match": "error",
            "jsdoc/check-alignment": "error",
            "jsdoc/check-indentation": "error",
            "max-classes-per-file": "off",
            "max-len": [
                "error",
                {
                    "code": 300
                }
            ],
            "new-parens": "error",
            "no-bitwise": "error",
            "no-caller": "error",
            "no-cond-assign": "error",
            "no-console": "off",
            "no-debugger": "error",
            "no-empty": "off",
            "no-empty-function": "off",
            "no-eval": "error",
            "no-fallthrough": "off",
            "no-invalid-this": "off",
            "no-new-wrappers": "error",
            "no-shadow": "off",
            "no-throw-literal": "error",
            "no-trailing-spaces": "error",
            "no-undef-init": "error",
            "no-underscore-dangle": "off",
            "no-unsafe-finally": "error",
            "no-unused-expressions": "off",
            "no-unused-labels": "error",
            "no-use-before-define": "off",
            "no-var": "error",
            "object-shorthand": "error",
            "one-var": [
                "error",
                "never"
            ],
            "prefer-arrow/prefer-arrow-functions": "off",
            "prefer-const": "error",
            "prefer-template": "error",
            "quotes": "off",
            "radix": "error",
            "use-isnan": "error",
            "valid-typeof": "off",
            "header/header": [
                "error",
                "block",
                {"pattern": "-{6,}"}
            ]
        },
        settings: {
            typescript: {}
        }
    }
);
