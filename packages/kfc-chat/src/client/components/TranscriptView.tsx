import type { TranscriptBlock } from "../types";

function bubbleShape(index: number, total: number) {
  if (total === 1) return "single";
  if (index === 0) return "top";
  if (index === total - 1) return "bottom";
  return "middle";
}

interface TranscriptViewProps {
  blocks: TranscriptBlock[];
  guidance: string;
}

export function TranscriptView(props: TranscriptViewProps) {
  if (!props.blocks.length) {
    return (
      <article class="transcript-empty">
        <strong>No conversation yet.</strong>
        <div>{props.guidance}</div>
      </article>
    );
  }

  return (
    <>
      {props.blocks.map((block) => {
        if (block.type === "event_row") {
          return (
            <article class="transcript-event" key={block.id}>
              <strong>{block.label || "Event"}</strong>
              <div>{block.text || ""}</div>
              <small>
                {block.created_at || ""}
                {block.status ? ` • ${block.status}` : ""}
              </small>
            </article>
          );
        }
        const items = block.items || [];
        return (
          <article class="message-group" key={block.id} data-role={block.role || "assistant"} data-align={block.align || "left"}>
            <div class="message-group-head">
              <span class="message-role">{block.label || "Codex"}</span>
              {block.status ? <span class="message-status">{block.status}</span> : null}
              <span class="message-time">{block.created_at || ""}</span>
            </div>
            <div class="message-group-body">
              {items.map((item, index) => (
                <div class="message-bubble" key={item.id} data-shape={bubbleShape(index, items.length)}>
                  {item.text || ""}
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </>
  );
}
