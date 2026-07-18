"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { fenceLanguage } from "@/lib/fence";
import { Mermaid } from "@/components/Mermaid";

const components: Components = {
  // Unwrap <pre> so a ```mermaid fence can render a block-level diagram without
  // an invalid <pre><div> nesting. The `code` renderer below re-adds <pre> for
  // real code blocks.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const lang = fenceLanguage(className);
    const text = String(children ?? "");
    // ponytail: block-vs-inline heuristic — a language class or a newline means
    // a fenced block; everything else is inline. Good enough for plan docs.
    const isBlock = lang !== null || text.includes("\n");

    if (lang === "mermaid") return <Mermaid chart={text.trim()} />;
    if (isBlock) {
      return (
        <pre>
          <code className={className}>{children}</code>
        </pre>
      );
    }
    return <code className={className}>{children}</code>;
  },
};

export function PlanViewer({ markdown }: { markdown: string }) {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
