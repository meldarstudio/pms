const DIRECTIVE =
  /^\/\s*<reference\b|^\s*@ts-(expect-error|ignore|nocheck)\b|^\s*(eslint|oxlint)-(disable|enable)/;

export default {
  meta: { name: "pms" },
  rules: {
    "no-comments": {
      meta: {
        type: "suggestion",
        docs: { description: "Disallow comments other than tool directives" },
        messages: { noComments: "Remove this comment." },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (DIRECTIVE.test(comment.value)) continue;
              context.report({ loc: comment.loc, messageId: "noComments" });
            }
          },
        };
      },
    },
  },
};
