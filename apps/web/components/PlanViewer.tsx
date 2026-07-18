"use client";

import type { ComponentType } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { fenceLanguage } from "@/lib/fence";
import { Mermaid } from "@/components/Mermaid";

export interface SelectionAnchor {
  /** Source offset where a new marker should be inserted (block end). */
  insertOffset: number;
  /** The selected text, shown as context in the comment UI. */
  quote: string;
  /** Bounding rect of the selection, for popover placement. */
  rect: DOMRect;
}

/**
 * Attach the block's source-offset range (from react-markdown's node.position)
 * as data attributes so a DOM selection can be mapped back to the markdown
 * source for inserting `@me` review markers.
 */
/* eslint-disable react/prop-types -- props are typed via generics, not propTypes */
function withOffsets<T extends keyof React.JSX.IntrinsicElements>(
  Tag: T,
): ComponentType<React.JSX.IntrinsicElements[T] & ExtraProps> {
  return function Block({ node, children, ...rest }) {
    const pos = node?.position;
    return (
      // @ts-expect-error - spreading intrinsic props onto a dynamic tag
      <Tag data-so={pos?.start.offset} data-eo={pos?.end.offset} {...rest}>
        {children}
      </Tag>
    );
  };
}
/* eslint-enable react/prop-types */

const components: Components = {
  // Unwrap <pre> so a ```mermaid fence can render a block-level diagram without
  // an invalid <pre><div> nesting. The `code` renderer below re-adds <pre>.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const lang = fenceLanguage(className);
    const text = String(children ?? "");
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
  p: withOffsets("p"),
  li: withOffsets("li"),
  h1: withOffsets("h1"),
  h2: withOffsets("h2"),
  h3: withOffsets("h3"),
  h4: withOffsets("h4"),
  blockquote: withOffsets("blockquote"),
  td: withOffsets("td"),
};

export function PlanViewer({
  markdown,
  onSelect,
}: {
  markdown: string;
  /** Called on a non-empty text selection when annotation is enabled. */
  onSelect?: (anchor: SelectionAnchor | null) => void;
}) {
  function handleMouseUp() {
    if (!onSelect) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      onSelect(null);
      return;
    }
    const quote = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const start = range.startContainer;
    const el = start.nodeType === Node.ELEMENT_NODE ? (start as Element) : start.parentElement;
    const block = el?.closest("[data-eo]");
    const eo = block ? Number(block.getAttribute("data-eo")) : NaN;
    if (!quote || !Number.isFinite(eo)) {
      onSelect(null);
      return;
    }
    onSelect({ insertOffset: eo, quote, rect: range.getBoundingClientRect() });
  }

  return (
    <article
      className="plan-prose prose prose-neutral dark:prose-invert max-w-none leading-7"
      onMouseUp={onSelect ? handleMouseUp : undefined}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
